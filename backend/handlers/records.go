package handlers

import (
	"daxiang/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── GetDailyRecords ──────────────────────────────────────────────────────────
// GET /api/books/:id/records?date=2026-05-23
// 返回 { todos: [...], history: [...] }
// 规则：mental_energy_reward 类别的记录绝不出现在账本首页

func (h *Handler) GetDailyRecords(c *gin.Context) {
	bookID := c.Param("id")
	dateStr := c.Query("date")

	var date time.Time
	var err error
	if dateStr == "" {
		date = time.Now()
	} else {
		date, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, fail(400, "日期格式错误，请使用 YYYY-MM-DD"))
			return
		}
	}

	dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.Local)
	dayEnd := dayStart.Add(24 * time.Hour)

	today := time.Now()
	todayStart := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.Local)
	isFuture := dayStart.After(todayStart)

	// 【待办栏】：
	// - 今天及过去：显示所有未完成 task（含过期）
	// - 未来日期：只显示当天安排的 task
	var todoRecords []models.Record
	if isFuture {
		h.DB.Where(
			"book_id = ? AND item_type = ? AND status = ? AND occurred_at >= ? AND occurred_at < ? AND category != ?",
			bookID, "task", "pending", dayStart, dayEnd, "mental_energy_reward",
		).Order("occurred_at asc").Find(&todoRecords)
	} else {
		h.DB.Where(
			"book_id = ? AND item_type = ? AND status = ? AND occurred_at < ? AND category != ?",
			bookID, "task", "pending", dayEnd, "mental_energy_reward",
		).Order("occurred_at asc").Find(&todoRecords)
	}

	// 【历史流】：今天的 expense/income，以及今天已 completed 的 task，排除心力消耗创收
	var historyRecords []models.Record
	h.DB.Where(
		"book_id = ? AND occurred_at >= ? AND occurred_at < ? AND category != ? AND (item_type = ? OR item_type = ? OR (item_type = ? AND status = ?))",
		bookID, dayStart, dayEnd, "mental_energy_reward", "expense", "income", "task", "completed",
	).Order("occurred_at desc").Find(&historyRecords)

	c.JSON(http.StatusOK, ok(gin.H{
		"todos":   enrichRecords(h, todoRecords),
		"history": enrichRecords(h, historyRecords),
	}))
}

// enrichRecords 为 record 列表补充 owner/creator 用户信息
func enrichRecords(h *Handler, records []models.Record) []gin.H {
	result := make([]gin.H, 0, len(records))
	userCache := map[string]models.User{}

	getUser := func(id string) models.User {
		if u, ok := userCache[id]; ok {
			return u
		}
		var u models.User
		h.DB.First(&u, "id = ?", id)
		userCache[id] = u
		return u
	}

	for _, r := range records {
		owner := getUser(r.OwnerID)
		// 获取 owner 在该 book 中的 alias
		var bm models.BookMember
		h.DB.Where("book_id = ? AND user_id = ?", r.BookID, r.OwnerID).First(&bm)

		result = append(result, gin.H{
			"id":          r.ID,
			"book_id":     r.BookID,
			"item_type":   r.ItemType,
			"category":    r.Category,
			"content":     r.Content,
			"amount":      r.Amount,
			"owner":       gin.H{"user_id": owner.ID, "username": owner.Username, "nickname": owner.Nickname, "alias": bm.Alias},
			"occurred_at": r.OccurredAt,
			"status":      r.Status,
			"created_at":  r.CreatedAt,
		})
	}
	return result
}

// ─── BatchCreateRecords ───────────────────────────────────────────────────────
// POST /api/records/batch

func (h *Handler) BatchCreateRecords(c *gin.Context) {
	creatorID := c.GetString("user_id")

	type ItemInput struct {
		ItemType   string    `json:"item_type"   binding:"required"`
		Category   string    `json:"category"    binding:"required"`
		Content    string    `json:"content"     binding:"required"`
		Amount     float64   `json:"amount"`
		OwnerID    string    `json:"owner_id"    binding:"required"`
		OccurredAt time.Time `json:"occurred_at"`
		Status     string    `json:"status"`
	}
	var req struct {
		BookID string      `json:"book_id" binding:"required"`
		Items  []ItemInput `json:"items"   binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, fail(400, "items 不能为空"))
		return
	}

	var created []string

	tx := h.DB.Begin()
	for _, item := range req.Items {
		occurredAt := item.OccurredAt
		if occurredAt.IsZero() {
			occurredAt = time.Now()
		}
		status := item.Status
			if item.ItemType != "task" {
				status = "completed"
			} else if status == "" {
				status = "pending"
			}
		rec := models.Record{
			BookID:     req.BookID,
			ItemType:   item.ItemType,
			Category:   item.Category,
			Content:    item.Content,
			Amount:     item.Amount,
			OwnerID:    item.OwnerID,
			CreatorID:  creatorID,
			OccurredAt: occurredAt,
			Status:     status,
		}
		if err := tx.Create(&rec).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, fail(500, "批量入库失败: "+err.Error()))
			return
		}
		created = append(created, rec.ID)
	}

	tx.Commit()

	c.JSON(http.StatusOK, ok(gin.H{
		"created_count": len(created),
		"created_ids":   created,
	}))
}

// ─── UpdateRecord ─────────────────────────────────────────────────────────────
// PUT /api/records/:id

func (h *Handler) UpdateRecord(c *gin.Context) {
	recID := c.Param("id")
	uid := c.GetString("user_id")

	var rec models.Record
	if err := h.DB.First(&rec, "id = ?", recID).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(404, "记录不存在"))
		return
	}

	// 只允许本账本成员修改（或创建人）
	var bm models.BookMember
	if h.DB.Where("book_id = ? AND user_id = ?", rec.BookID, uid).First(&bm).Error != nil {
		c.JSON(http.StatusForbidden, fail(403, "无权修改此记录"))
		return
	}

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	// 禁止修改系统保护字段
	delete(updates, "id")
	delete(updates, "book_id")
	delete(updates, "creator_id")
	delete(updates, "is_mental_energy_reward")

	h.DB.Model(&rec).Updates(updates)
	c.JSON(http.StatusOK, ok(rec))
}

// ─── DeleteRecord ─────────────────────────────────────────────────────────────
// DELETE /api/records/:id

func (h *Handler) DeleteRecord(c *gin.Context) {
	recID := c.Param("id")
	uid := c.GetString("user_id")

	var rec models.Record
	if err := h.DB.First(&rec, "id = ?", recID).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(404, "记录不存在"))
		return
	}

	var bm models.BookMember
	if h.DB.Where("book_id = ? AND user_id = ?", rec.BookID, uid).First(&bm).Error != nil {
		c.JSON(http.StatusForbidden, fail(403, "无权删除此记录"))
		return
	}

	h.DB.Delete(&rec)
	c.JSON(http.StatusOK, ok(gin.H{"deleted": true}))
}

// ─── GetSystemConfigs ─────────────────────────────────────────────────────────

func (h *Handler) GetSystemConfigs(c *gin.Context) {
	var pricings []models.TaskPricing
	h.DB.Find(&pricings)
	var sysConfigs []models.SystemConfig
	h.DB.Find(&sysConfigs)

	c.JSON(http.StatusOK, ok(gin.H{
		"task_pricings":  pricings,
		"system_configs": sysConfigs,
	}))
}

// ─── UpdateConfig ─────────────────────────────────────────────────────────────
// POST /api/config/update  （演示用：动态修改心力奖励金额或事项定价）

func (h *Handler) UpdateConfig(c *gin.Context) {
	var req struct {
		Type    string  `json:"type"    binding:"required"` // "system" | "pricing"
		Key     string  `json:"key"     binding:"required"`
		Value   float64 `json:"value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	switch req.Type {
	case "system":
		result := h.DB.Model(&models.SystemConfig{}).
			Where("config_key = ?", req.Key).
			Update("config_val", req.Value)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, fail(500, "更新系统配置失败"))
			return
		}
		if result.RowsAffected == 0 {
			sc := models.SystemConfig{ConfigKey: req.Key, ConfigVal: req.Value}
			if err := h.DB.Create(&sc).Error; err != nil {
				c.JSON(http.StatusInternalServerError, fail(500, "新增系统配置失败"))
				return
			}
		}
	case "pricing":
		result := h.DB.Model(&models.TaskPricing{}).
			Where("task_keyword = ?", req.Key).
			Update("preset_amount", req.Value)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, fail(500, "更新事项定价失败"))
			return
		}
		if result.RowsAffected == 0 {
			// 新增
			p := models.TaskPricing{TaskKeyword: req.Key, PresetAmount: req.Value}
			if err := h.DB.Create(&p).Error; err != nil {
				c.JSON(http.StatusInternalServerError, fail(500, "新增事项定价失败"))
				return
			}
		}
	default:
		c.JSON(http.StatusBadRequest, fail(400, "type 只能为 system 或 pricing"))
		return
	}

	c.JSON(http.StatusOK, ok(gin.H{"updated": true, "key": req.Key, "value": req.Value}))
}
