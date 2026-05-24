package handlers

import (
	"bytes"
	"compress/gzip"
	"daxiang/models"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ─── AIParseInput ─────────────────────────────────────────────────────────────
// POST /api/ai/parse  (文本输入)

func (h *Handler) AIParseInput(c *gin.Context) {
	creatorID := c.GetString("user_id")

	var req struct {
		BookID    string `json:"book_id"    binding:"required"`
		InputText string `json:"input_text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	stagedItems, err := h.doParseText(req.BookID, req.InputText, creatorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, err.Error()))
		return
	}
	c.JSON(http.StatusOK, ok(gin.H{"staged_items": stagedItems}))
}

// ─── AIParseVoice ─────────────────────────────────────────────────────────────
// POST /api/ai/parse-voice  (语音文件上传 → 转写 → 解析)

func (h *Handler) AIParseVoice(c *gin.Context) {
	creatorID := c.GetString("user_id")
	bookID := c.PostForm("book_id")
	if bookID == "" {
		c.JSON(http.StatusBadRequest, fail(400, "book_id 不能为空"))
		return
	}

	// 1. 接收上传的音频文件
	fileHeader, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, fail(400, "未找到 audio 文件字段"))
		return
	}

	audioFile, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "打开音频文件失败"))
		return
	}
	defer audioFile.Close()
	audioBytes, err := io.ReadAll(audioFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "读取音频文件失败"))
		return
	}

	// 2. 语音转文字
	transcribed, err := speechToText(audioBytes, fileHeader.Filename)
	if err != nil {
		// STT 失败时返回错误，让前端降级到文字输入
		c.JSON(http.StatusServiceUnavailable, fail(503, "语音识别失败："+err.Error()))
		return
	}

	if strings.TrimSpace(transcribed) == "" {
		c.JSON(http.StatusOK, fail(400, "语音内容为空，请重新录制"))
		return
	}

	// 3. 复用文字解析逻辑
	stagedItems, err := h.doParseText(bookID, transcribed, creatorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, err.Error()))
		return
	}
	c.JSON(http.StatusOK, ok(gin.H{
		"transcribed_text": transcribed,
		"staged_items":     stagedItems,
	}))
}

// POST /api/ai/parse-voice-stream (语音上传 + 流式回传识别文本)
func (h *Handler) AIParseVoiceStream(c *gin.Context) {
	creatorID := c.GetString("user_id")
	bookID := c.PostForm("book_id")
	if bookID == "" {
		c.JSON(http.StatusBadRequest, fail(400, "book_id 不能为空"))
		return
	}

	fileHeader, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, fail(400, "未找到 audio 文件字段"))
		return
	}

	audioFile, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "打开音频文件失败"))
		return
	}
	defer audioFile.Close()
	audioBytes, err := io.ReadAll(audioFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "读取音频文件失败"))
		return
	}

	c.Writer.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	flush, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, fail(500, "当前连接不支持流式输出"))
		return
	}

	writeEvent := func(v map[string]interface{}) {
		b, _ := json.Marshal(v)
		_, _ = c.Writer.Write(append(b, '\n'))
		flush.Flush()
	}

	lastPartial := ""
	transcribed, sttErr := speechToTextStream(audioBytes, fileHeader.Filename, func(partial string) {
		partial = strings.TrimSpace(partial)
		if partial == "" || partial == lastPartial {
			return
		}
		lastPartial = partial
		writeEvent(map[string]interface{}{"type": "partial", "text": partial})
	})
	if sttErr != nil {
		writeEvent(map[string]interface{}{"type": "error", "message": "语音识别失败：" + sttErr.Error()})
		return
	}

	if strings.TrimSpace(transcribed) == "" {
		writeEvent(map[string]interface{}{"type": "error", "message": "语音内容为空，请重新录制"})
		return
	}

	// 流式接口只负责语音转写，避免把后续AI解析错误误报成“语音识别失败”。
	// 用户点击“解析”按钮时再走 /api/ai/parse 完成结构化解析。
	_ = creatorID
	_ = bookID
	writeEvent(map[string]interface{}{
		"type":             "final",
		"transcribed_text": transcribed,
	})
}

// ─── doParseText ──────────────────────────────────────────────────────────────
// 核心共享逻辑：文本 → LLM 推理 → []stagedItem

func (h *Handler) doParseText(bookID, inputText, creatorID string) ([]map[string]interface{}, error) {
	// 从 TaskPricing 表读取定价
	var pricings []models.TaskPricing
	h.DB.Find(&pricings)
	pricingLines := make([]string, 0, len(pricings))
	for _, p := range pricings {
		pricingLines = append(pricingLines, fmt.Sprintf("%s: %.0f元", p.TaskKeyword, p.PresetAmount))
	}
	pricingContext := strings.Join(pricingLines, "\n")

	// 获取账本成员
	var members []models.BookMember
	h.DB.Where("book_id = ?", bookID).Find(&members)
	var memberInfos []memberInfoBasic
	for _, m := range members {
		var u models.User
		h.DB.First(&u, "id = ?", m.UserID)
		memberInfos = append(memberInfos, memberInfoBasic{
			UserID: u.ID, Username: u.Username, Nickname: u.Nickname, Alias: m.Alias,
		})
	}
	memberLines := make([]string, 0, len(memberInfos))
	for _, m := range memberInfos {
		display := m.Nickname
		if m.Alias != "" {
			display = m.Alias + "(" + m.Nickname + ")"
		}
		memberLines = append(memberLines, display+"/"+m.Username)
	}

	// 当前操作人（用于 prompt 里定义“我”）
	var creatorUser models.User
	h.DB.First(&creatorUser, "id = ?", creatorID)
	creatorAlias := ""
	for _, m := range memberInfos {
		if m.UserID == creatorID {
			creatorAlias = m.Alias
			if creatorUser.Username == "" {
				creatorUser.Username = m.Username
			}
			if creatorUser.Nickname == "" {
				creatorUser.Nickname = m.Nickname
			}
			break
		}
	}

	nowStr := time.Now().Format("2006-01-02T15:04:05Z07:00")
	fullPrompt := fmt.Sprintf(`你是"大象账本"的智能录入助手。请将用户的自然语言描述解析为结构化的记账条目数组。

【当前时间】%s

【事项标准定价参考表（来自数据库，请优先使用）】
%s
（若输入事项不在定价表内，请根据劳动强度合理估算金额）

【账本当前成员列表（格式：显示名/用户名）】
%s

【当前操作人（也就是“我”）】
- user_id: %s
- username: %s
- nickname: %s
- alias_in_book: %s

	【负责人识别规则】
	- 输入中的“我 / 我自己 / 本人 / 自己 / me / myself”都表示当前操作人，owner_username 必须填写为 "%s"。
	- 若句子中有明确成员名字，优先按成员名字映射；没有明确成员时再使用“我”。
	- 关键约束：只要句子主语是“我”，且没有出现其他成员姓名/别名，严禁把 owner_username 填成其他人。

	【示例】
	输入：我今天拖了地
	输出中的 owner_username 必须是：%s

	【输出格式要求】
	严格输出 JSON 数组，不要有任何其他文字，每个元素包含：
	- 一条记录只允许一个动作；若一句话里有多个并列动作（如“拖了地，洗了碗”），必须拆成多条元素，禁止合并成一条
	- item_type: “expense”（实际消费）、”task”（劳动/待办事项）或 “income”（收入）
	- category: expense 枚举(food/transport/shopping/entertainment/medical/other)，task 枚举(cleaning/cooking/errand/care/maintenance/reminder/other)，income 枚举(salary/bonus/transfer/investment/other)
	- content: 事项描述。若属于多步骤复杂流程（如医院就诊），请将子步骤写成 “[ ] 空腹\n[ ] 带医保卡\n[ ] 挂号” 格式嵌入 content
	- amount: 数字，expense 为实际金额，task 为预估劳动价值（参考定价表），income 为收入金额
	- owner_username: 从成员列表中推断负责人的用户名，若无法判断则留空字符串
	- occurred_at: ISO8601 时间字符串，若未提及则使用当前时间
	- status: 必须按语义判断
	  expense 一律为 “completed”
	  income 一律为 “completed”
	  task 若语句表达”已做完/已经完成/拖了地/做了/刚做完”等已发生事实，用 “completed”
	  task 若语句表达”待做/要做/准备做/计划做/提醒做”等未完成事项，用 “pending”
	  task 没有明确完成线索时，才用默认 “pending”

	【status 示例】
	- "我今天拖了地" -> status="completed"
	- "我今晚要拖地" -> status="pending"

	【拆分示例】
	- 输入：我今天拖了地，洗了碗
	- 输出：必须是 2 个元素，分别对应“拖地”和“洗碗”

只输出 JSON 数组，禁止输出任何 markdown 代码块或解释文字。

用户输入：%s`,
		nowStr,
		pricingContext,
		strings.Join(memberLines, ", "),
		creatorID,
		creatorUser.Username,
		creatorUser.Nickname,
		creatorAlias,
		creatorUser.Username,
		creatorUser.Username,
		inputText,
	)

	apiKey := os.Getenv("ARK_API_KEY")
	apiBase := os.Getenv("ARK_API_BASE")
	model := os.Getenv("ARK_MODEL")
	if apiBase == "" {
		apiBase = "https://ark.cn-beijing.volces.com/api/v3"
	}
	if model == "" {
		model = "doubao-seed-2-0-lite-260215"
	}

	if apiKey == "" {
		return nil, fmt.Errorf("未配置 ARK_API_KEY，无法进行实时模型解析")
	}

	items, err := callArkLLM(apiBase, apiKey, model, fullPrompt)
	if err != nil {
		return nil, fmt.Errorf("模型调用失败: %w", err)
	}
	stagedItems := items

	stagedItems = maybeExpandMultiTaskItems(inputText, stagedItems, pricings)

	forceOwnerToCreator := shouldForceOwnerToCreator(inputText, memberInfos, creatorID)

	// 补全 owner_id
	for i, item := range stagedItems {
		ownerUsername, _ := item["owner_username"].(string)
		ownerUsername = strings.TrimSpace(ownerUsername)

		if isSelfReference(ownerUsername) {
			stagedItems[i]["owner_id"] = creatorID
			if creatorUser.Username != "" {
				stagedItems[i]["owner_username"] = creatorUser.Username
			}
		} else if ownerUsername != "" {
			for _, m := range memberInfos {
				if m.Username == ownerUsername || m.Nickname == ownerUsername || m.Alias == ownerUsername {
					stagedItems[i]["owner_id"] = m.UserID
					break
				}
			}
		}
		if _, ok := stagedItems[i]["owner_id"]; !ok {
			stagedItems[i]["owner_id"] = creatorID
		}

		if forceOwnerToCreator {
			stagedItems[i]["owner_id"] = creatorID
			if creatorUser.Username != "" {
				stagedItems[i]["owner_username"] = creatorUser.Username
			}
		}

	}
	return stagedItems, nil
}

func isSelfReference(v string) bool {
	norm := strings.ToLower(strings.TrimSpace(v))
	norm = strings.Trim(norm, "\"'`[]{}()（）<>《》“” ")
	switch norm {
	case "我", "我自己", "本人", "自己", "me", "myself":
		return true
	default:
		return false
	}
}

func shouldForceOwnerToCreator(input string, members []memberInfoBasic, creatorID string) bool {
	t := strings.TrimSpace(input)
	if t == "" {
		return false
	}

	if !hasSelfCue(t) {
		return false
	}

	for _, m := range members {
		if m.UserID == creatorID {
			continue
		}
		if containsAnyName(t, m) {
			return false
		}
	}

	return true
}

func hasSelfCue(input string) bool {
	selfWords := []string{"我", "我自己", "本人", "自己", "me", "myself"}
	lower := strings.ToLower(input)
	for _, w := range selfWords {
		if strings.Contains(lower, strings.ToLower(w)) {
			return true
		}
	}
	return false
}

func containsAnyName(input string, m memberInfoBasic) bool {
	for _, name := range []string{m.Username, m.Nickname, m.Alias} {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if strings.Contains(input, name) {
			return true
		}
	}
	return false
}

// ─── speechToText ─────────────────────────────────────────────────────────────
func speechToText(audioBytes []byte, filename string) (string, error) {
	return speechToTextStream(audioBytes, filename, nil)
}

func speechToTextStream(audioBytes []byte, filename string, onPartial func(string)) (string, error) {
	appKey := strings.TrimSpace(os.Getenv("BYTEDANCE_ASR_KEY"))
	if appKey == "" {
		return "", fmt.Errorf("未配置 BYTEDANCE_ASR_KEY，请在 .env 中设置")
	}

	resourceID := strings.TrimSpace(os.Getenv("BYTEDANCE_ASR_RESOURCE_ID"))
	if resourceID == "" || resourceID == "volc.seedasr.auc" {
		resourceID = "volc.bigasr.sauc.duration"
	}

	accessKey := strings.TrimSpace(os.Getenv("BYTEDANCE_ASR_ACCESS_KEY"))
	if accessKey == "" {
		accessKey = appKey
	}

	return callByteDanceSAUC(appKey, accessKey, resourceID, audioBytes, filename, onPartial)
}

func callByteDanceSAUC(appKey, accessKey, resourceID string, audioBytes []byte, filename string, onPartial func(string)) (string, error) {
	ext := strings.ToLower(strings.TrimPrefix(filenameExt(filename), "."))
	if ext == "" {
		ext = "wav"
	}
	if ext != "raw" && ext != "wav" {
		return "", fmt.Errorf("不支持的音频格式: %s，仅支持 raw/wav", ext)
	}

	pcm, rate, err := normalizeToPCM16kMono(audioBytes, ext)
	if err != nil {
		return "", err
	}

	reqID := uuid.New().String()
	headers := http.Header{}
	headers.Set("X-Api-App-Key", appKey)
	headers.Set("X-Api-Access-Key", accessKey)
	headers.Set("X-Api-Resource-Id", resourceID)
	headers.Set("X-Api-Request-Id", reqID)

	conn, resp, err := websocket.DefaultDialer.Dial(func() string {
		wsURL := strings.TrimSpace(os.Getenv("BYTEDANCE_ASR_WS_URL"))
		if wsURL == "" {
			wsURL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
		}
		return wsURL
	}(), headers)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(resp.Body)
			logID := resp.Header.Get("X-Tt-Logid")
			return "", fmt.Errorf("SAUC 连接失败: status=%d logid=%s body=%s", resp.StatusCode, logID, string(body))
		}
		return "", fmt.Errorf("SAUC 连接失败: %w", err)
	}
	defer conn.Close()
	connLogID := ""
	if resp != nil {
		connLogID = resp.Header.Get("X-Tt-Logid")
	}
	log.Printf("[SAUC] using ws endpoint=%s", func() string {
		if v := strings.TrimSpace(os.Getenv("BYTEDANCE_ASR_WS_URL")); v != "" {
			return v
		}
		return "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
	}())

	log.Printf("[SAUC] connect ok logid=%s rate=%d bytes=%d", connLogID, rate, len(pcm))
	if err := conn.WriteMessage(websocket.BinaryMessage, buildSaucFullRequest(rate)); err != nil {
		return "", fmt.Errorf("SAUC full request 发送失败: %w (logid=%s)", err, connLogID)
	}
	if _, msg, err := conn.ReadMessage(); err != nil {
		return "", fmt.Errorf("SAUC full response 接收失败: %w (logid=%s)", err, connLogID)
	} else if code, _, _ := parseSaucMessage(msg); code != 0 {
		return "", fmt.Errorf("SAUC full response 错误 code=%d (logid=%s)", code, connLogID)
	}

	segments := splitAudioByDurationPCM(pcm, rate, 200)
	log.Printf("[SAUC] sending audio segments=%d", len(segments))
	for i, seg := range segments {
		seq := i + 2
		isLast := i == len(segments)-1
		if isLast {
			seq = -seq
		}
		log.Printf("[SAUC] send audio seq=%d isLast=%v segmentBytes=%d", seq, isLast, len(seg))
		if err := conn.WriteMessage(websocket.BinaryMessage, buildSaucAudioRequest(seq, isLast, seg)); err != nil {
			return "", fmt.Errorf("SAUC audio 发送失败: %w (logid=%s)", err, connLogID)
		}
	}

	deadline := time.Now().Add(50 * time.Second)
	_ = conn.SetReadDeadline(deadline)
	finalText := ""
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				break
			}
			if strings.Contains(strings.ToLower(err.Error()), "i/o timeout") {
				break
			}
			return "", fmt.Errorf("SAUC 读取失败: %w (logid=%s)", err, connLogID)
		}
		code, isLast, txt := parseSaucMessage(msg)
		if strings.TrimSpace(txt) != "" {
			log.Printf("[SAUC] text update=%q", clipForLog(txt, 200))
			finalText = strings.TrimSpace(txt)
			if onPartial != nil {
				onPartial(finalText)
			}
		}
		if code != 0 {
			log.Printf("[SAUC] got non-zero code=%d txt=%q finalText=%q", code, clipForLog(txt, 120), clipForLog(finalText, 120))
			// 有些场景服务端会在最终阶段返回错误帧，但前面已给出可用文本。
			if strings.TrimSpace(finalText) != "" {
				break
			}
			return "", fmt.Errorf("SAUC 返回错误 code=%d text=%s (logid=%s)", code, txt, connLogID)
		}
		if isLast {
			break
		}
	}

	if strings.TrimSpace(finalText) == "" {
		return "", fmt.Errorf("SAUC 未返回识别文本 (logid=%s)", connLogID)
	}
	return finalText, nil
}

func filenameExt(name string) string {
	i := strings.LastIndex(name, ".")
	if i < 0 || i == len(name)-1 {
		return ""
	}
	return name[i:]
}

func normalizeToPCM16kMono(audioBytes []byte, ext string) ([]byte, int, error) {
	if ext == "raw" {
		return audioBytes, 16000, nil
	}
	if ext != "wav" {
		return nil, 0, fmt.Errorf("不支持的音频格式: %s，仅支持 raw/wav", ext)
	}

	pcm, rate, channels, bits, err := parseWavPCM(audioBytes)
	if err != nil {
		return nil, 0, fmt.Errorf("wav解析失败: %w", err)
	}
	return wavToPCM16kMono(pcm, rate, channels, bits)
}

func parseWavPCM(b []byte) ([]byte, int, int, int, error) {
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return nil, 0, 0, 0, fmt.Errorf("非wav格式")
	}

	var (
		audioFormat uint16
		rate        int
		bits        int
		channels    int
		data        []byte
	)

	i := 12
	for i+8 <= len(b) {
		chunkID := string(b[i : i+4])
		sz := int(binary.LittleEndian.Uint32(b[i+4 : i+8]))
		i += 8
		if i+sz > len(b) {
			return nil, 0, 0, 0, fmt.Errorf("wav数据块损坏")
		}

		switch chunkID {
		case "fmt ":
			if sz < 16 {
				return nil, 0, 0, 0, fmt.Errorf("wav fmt块过短")
			}
			audioFormat = binary.LittleEndian.Uint16(b[i : i+2])
			channels = int(binary.LittleEndian.Uint16(b[i+2 : i+4]))
			rate = int(binary.LittleEndian.Uint32(b[i+4 : i+8]))
			bits = int(binary.LittleEndian.Uint16(b[i+14 : i+16]))
		case "data":
			data = b[i : i+sz]
		}

		i += sz
		if sz%2 == 1 {
			i++
		}
	}

	if rate == 0 || channels == 0 || bits == 0 {
		return nil, 0, 0, 0, fmt.Errorf("wav缺少fmt信息")
	}
	if len(data) == 0 {
		return nil, 0, 0, 0, fmt.Errorf("wav缺少data块")
	}
	if audioFormat != 1 {
		return nil, 0, 0, 0, fmt.Errorf("仅支持PCM wav，当前format=%d", audioFormat)
	}
	return data, rate, channels, bits, nil
}

func wavToPCM16kMono(pcm []byte, sampleRate, channels, bits int) ([]byte, int, error) {
	if sampleRate <= 0 || channels <= 0 {
		return nil, 0, fmt.Errorf("wav参数非法 rate=%d channels=%d", sampleRate, channels)
	}

	mono, err := decodePCMToMonoInt16(pcm, channels, bits)
	if err != nil {
		return nil, 0, err
	}
	resampled := resampleInt16Linear(mono, sampleRate, 16000)

	out := make([]byte, len(resampled)*2)
	for i, s := range resampled {
		binary.LittleEndian.PutUint16(out[i*2:i*2+2], uint16(s))
	}
	return out, 16000, nil
}

func decodePCMToMonoInt16(pcm []byte, channels, bits int) ([]int16, error) {
	if bits != 8 && bits != 16 && bits != 24 && bits != 32 {
		return nil, fmt.Errorf("不支持的wav位深: %dbit", bits)
	}
	bytesPerSample := bits / 8
	frameSize := bytesPerSample * channels
	if frameSize <= 0 || len(pcm) < frameSize {
		return nil, fmt.Errorf("wav数据长度不足")
	}

	frames := len(pcm) / frameSize
	out := make([]int16, frames)
	for i := 0; i < frames; i++ {
		frameStart := i * frameSize
		var sum int32
		for c := 0; c < channels; c++ {
			s := readSampleAsInt16(pcm[frameStart+c*bytesPerSample:frameStart+(c+1)*bytesPerSample], bits)
			sum += int32(s)
		}
		out[i] = int16(sum / int32(channels))
	}
	return out, nil
}

func readSampleAsInt16(b []byte, bits int) int16 {
	switch bits {
	case 8:
		return int16(int(b[0])-128) << 8
	case 16:
		return int16(binary.LittleEndian.Uint16(b))
	case 24:
		v := int32(b[0]) | int32(b[1])<<8 | int32(b[2])<<16
		if v&0x800000 != 0 {
			v |= ^0xFFFFFF
		}
		return int16(v >> 8)
	case 32:
		v := int32(binary.LittleEndian.Uint32(b))
		return int16(v >> 16)
	default:
		return 0
	}
}

func resampleInt16Linear(src []int16, srcRate, dstRate int) []int16 {
	if len(src) == 0 || srcRate <= 0 || dstRate <= 0 || srcRate == dstRate {
		return src
	}

	dstLen := int(math.Round(float64(len(src)) * float64(dstRate) / float64(srcRate)))
	if dstLen < 1 {
		dstLen = 1
	}

	dst := make([]int16, dstLen)
	for i := 0; i < dstLen; i++ {
		srcPos := float64(i) * float64(srcRate) / float64(dstRate)
		idx := int(srcPos)
		if idx >= len(src)-1 {
			dst[i] = src[len(src)-1]
			continue
		}
		frac := srcPos - float64(idx)
		v := (1-frac)*float64(src[idx]) + frac*float64(src[idx+1])
		if v > 32767 {
			v = 32767
		}
		if v < -32768 {
			v = -32768
		}
		dst[i] = int16(v)
	}
	return dst
}

func splitAudioByDurationPCM(pcm []byte, sampleRate, segmentMs int) [][]byte {
	if segmentMs <= 0 {
		segmentMs = 200
	}
	bytesPerSec := sampleRate * 2
	chunk := bytesPerSec * segmentMs / 1000
	if chunk <= 0 {
		chunk = 6400
	}
	out := make([][]byte, 0, len(pcm)/chunk+1)
	for i := 0; i < len(pcm); i += chunk {
		j := i + chunk
		if j > len(pcm) {
			j = len(pcm)
		}
		out = append(out, pcm[i:j])
	}
	if len(out) == 0 {
		out = append(out, []byte{})
	}
	return out
}

func gzipCompress(input []byte) []byte {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	_, _ = w.Write(input)
	_ = w.Close()
	return buf.Bytes()
}

func buildSaucHeader(messageType byte, flags byte, serialization byte, compression byte) []byte {
	const protocolVersion byte = 0x1
	const headerWords byte = 0x1 // 1 * 4 bytes
	return []byte{
		(protocolVersion << 4) | headerWords,
		(messageType << 4) | (flags & 0x0f),
		((serialization & 0x0f) << 4) | (compression & 0x0f),
		0x00,
	}
}

func buildSaucFullRequest(sampleRate int) []byte {
	payload := map[string]interface{}{
		"user": map[string]interface{}{"uid": "mammoth-user"},
		"audio": map[string]interface{}{
			"format":  "pcm",
			"codec":   "raw",
			"rate":    sampleRate,
			"bits":    16,
			"channel": 1,
		},
		"request": map[string]interface{}{
			"model_name":       "bigmodel",
			"enable_itn":       true,
			"enable_punc":      true,
			"enable_ddc":       true,
			"show_utterances":  true,
			"enable_nonstream": false,
		},
	}
	jb, _ := json.Marshal(payload)
	zip := gzipCompress(jb)

	header := buildSaucHeader(1, 1, 1, 1)
	buf := make([]byte, 0, 4+4+4+len(zip))
	buf = append(buf, header...)
	seq := make([]byte, 4)
	binary.BigEndian.PutUint32(seq, 1)
	buf = append(buf, seq...)
	sz := make([]byte, 4)
	binary.BigEndian.PutUint32(sz, uint32(len(zip)))
	buf = append(buf, sz...)
	buf = append(buf, zip...)
	return buf
}

func buildSaucAudioRequest(seq int, isLast bool, segment []byte) []byte {
	flags := byte(1)
	if isLast {
		flags = 3
	}
	zip := gzipCompress(segment)

	header := buildSaucHeader(2, flags, 1, 1)
	buf := make([]byte, 0, 4+4+4+len(zip))
	buf = append(buf, header...)
	seqB := make([]byte, 4)
	binary.BigEndian.PutUint32(seqB, uint32(int32(seq)))
	buf = append(buf, seqB...)
	sz := make([]byte, 4)
	binary.BigEndian.PutUint32(sz, uint32(len(zip)))
	buf = append(buf, sz...)
	buf = append(buf, zip...)
	return buf
}

func clipForLog(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "...(truncated)"
}

func parseSaucMessage(msg []byte) (code int, isLast bool, text string) {
	if len(msg) < 4 {
		log.Printf("[SAUC] frame too short len=%d", len(msg))
		return 0, false, ""
	}
	headerSize := int(msg[0] & 0x0f)
	if len(msg) < headerSize*4 {
		log.Printf("[SAUC] invalid header size headerWords=%d len=%d", headerSize, len(msg))
		return 0, false, ""
	}
	messageType := (msg[1] >> 4) & 0x0f
	flags := msg[1] & 0x0f
	compression := msg[2] & 0x0f

	payload := msg[headerSize*4:]
	log.Printf("[SAUC] recv frame len=%d type=%d flags=%d compression=%d payload=%d", len(msg), messageType, flags, compression, len(payload))
	if flags&0x01 != 0 && len(payload) >= 4 {
		payload = payload[4:]
	}
	if flags&0x02 != 0 {
		isLast = true
	}
	if flags&0x04 != 0 && len(payload) >= 4 {
		payload = payload[4:]
	}

	switch messageType {
	case 9:
		if len(payload) >= 4 {
			sz := int(binary.BigEndian.Uint32(payload[:4]))
			if sz >= 0 && 4+sz <= len(payload) {
				payload = payload[4 : 4+sz]
			} else {
				payload = payload[4:]
			}
		}
	case 15:
		if len(payload) >= 8 {
			code = int(binary.BigEndian.Uint32(payload[:4]))
			sz := int(binary.BigEndian.Uint32(payload[4:8]))
			if sz >= 0 && 8+sz <= len(payload) {
				payload = payload[8 : 8+sz]
			} else {
				payload = payload[8:]
			}
		}
	default:
		log.Printf("[SAUC] ignore unsupported messageType=%d flags=%d", messageType, flags)
		return 0, isLast, ""
	}

	if compression == 1 {
		zr, err := gzip.NewReader(bytes.NewReader(payload))
		if err == nil {
			defer zr.Close()
			if unz, err := io.ReadAll(zr); err == nil {
				payload = unz
			}
		}
	}

	var body struct {
		Result struct {
			Text string `json:"text"`
		} `json:"result"`
		Payload struct {
			Text string `json:"text"`
		} `json:"payload"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(payload, &body)
	if strings.TrimSpace(body.Result.Text) != "" {
		text = strings.TrimSpace(body.Result.Text)
	} else if strings.TrimSpace(body.Payload.Text) != "" {
		text = strings.TrimSpace(body.Payload.Text)
	} else if strings.TrimSpace(body.Error) != "" {
		text = strings.TrimSpace(body.Error)
	}
	log.Printf("[SAUC] parsed code=%d isLast=%v text=%q", code, isLast, clipForLog(text, 160))
	return code, isLast, text
} // ─── callArkLLM ───────────────────────────────────────────────────────────────

func callArkLLM(apiBase, apiKey, model, fullPrompt string) ([]map[string]interface{}, error) {
	payload := map[string]interface{}{
		"model": model,
		"input": fullPrompt,
	}
	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequest("POST", apiBase+"/responses", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("HTTP 请求失败: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ark API 返回错误 %d: %s", resp.StatusCode, string(respBody))
	}

	var arkResp struct {
		Output []struct {
			Type    string `json:"type"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		OutputText string `json:"output_text"`
	}
	if err := json.Unmarshal(respBody, &arkResp); err != nil {
		return nil, fmt.Errorf("解析 Ark 响应失败: %w, body=%s", err, string(respBody))
	}

	var rawText string
	if arkResp.OutputText != "" {
		rawText = arkResp.OutputText
	} else {
		for _, out := range arkResp.Output {
			for _, c := range out.Content {
				if (c.Type == "text" || c.Type == "output_text") && c.Text != "" {
					rawText = c.Text
					break
				}
			}
			if rawText != "" {
				break
			}
		}
	}
	if rawText == "" {
		return nil, fmt.Errorf("Ark 响应文本为空, body=%s", string(respBody))
	}
	return parseJSONArray(rawText)
}

// ─── parseJSONArray ───────────────────────────────────────────────────────────

func parseJSONArray(raw string) ([]map[string]interface{}, error) {
	text := strings.TrimSpace(raw)
	if idx := strings.Index(text, "```json"); idx != -1 {
		text = text[idx+7:]
	} else if idx := strings.Index(text, "```"); idx != -1 {
		text = text[idx+3:]
	}
	if idx := strings.LastIndex(text, "```"); idx != -1 {
		text = text[:idx]
	}
	text = strings.TrimSpace(text)
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("响应中未找到 JSON 数组: %s", text)
	}
	text = text[start : end+1]
	var items []map[string]interface{}
	if err := json.Unmarshal([]byte(text), &items); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w, text=%s", err, text)
	}
	return items, nil
}

// ─── memberInfoBasic ──────────────────────────────────────────────────────────

type memberInfoBasic struct {
	UserID   string
	Username string
	Nickname string
	Alias    string
}

// 兜底：当模型把并列任务合并成 1 条时，按定价关键词拆分为多条任务
func maybeExpandMultiTaskItems(input string, stagedItems []map[string]interface{}, pricings []models.TaskPricing) []map[string]interface{} {
	if len(stagedItems) != 1 {
		return stagedItems
	}
	if strings.TrimSpace(input) == "" {
		return stagedItems
	}

	base := stagedItems[0]
	itemType, _ := base["item_type"].(string)
	if itemType != "" && itemType != "task" {
		return stagedItems
	}

	matched := make([]models.TaskPricing, 0)
	seen := make(map[string]struct{})
	for _, p := range pricings {
		kw := strings.TrimSpace(p.TaskKeyword)
		if kw == "" {
			continue
		}
		if _, ok := seen[kw]; ok {
			continue
		}
		if strings.Contains(input, kw) {
			seen[kw] = struct{}{}
			matched = append(matched, p)
		}
	}

	if len(matched) < 2 {
		return stagedItems
	}

	ownerUsername, _ := base["owner_username"].(string)
	occurredAt, _ := base["occurred_at"].(string)
	status, _ := base["status"].(string)
	if status == "" {
		status = "pending"
	}

	expanded := make([]map[string]interface{}, 0, len(matched))
	for _, p := range matched {
		expanded = append(expanded, map[string]interface{}{
			"item_type":      "task",
			"category":       inferTaskCategoryFromKeyword(p.TaskKeyword),
			"content":        p.TaskKeyword,
			"amount":         p.PresetAmount,
			"owner_username": ownerUsername,
			"occurred_at":    occurredAt,
			"status":         status,
		})
	}

	return expanded
}

func inferTaskCategoryFromKeyword(keyword string) string {
	kw := strings.TrimSpace(keyword)
	switch {
	case strings.Contains(kw, "做饭"):
		return "cooking"
	case strings.Contains(kw, "洗碗"), strings.Contains(kw, "拖地"), strings.Contains(kw, "打扫"), strings.Contains(kw, "倒垃圾"), strings.Contains(kw, "收纳"), strings.Contains(kw, "洗衣"):
		return "cleaning"
	case strings.Contains(kw, "采购"), strings.Contains(kw, "买"), strings.Contains(kw, "缴费"), strings.Contains(kw, "接送"), strings.Contains(kw, "遛狗"):
		return "errand"
	case strings.Contains(kw, "辅导"), strings.Contains(kw, "陪诊"):
		return "care"
	case strings.Contains(kw, "修理"):
		return "maintenance"
	default:
		return "other"
	}
}
