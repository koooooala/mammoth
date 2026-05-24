package handlers

import (
	"daxiang/models"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type hvTask struct {
	Content string  `json:"content"`
	Amount  float64 `json:"amount"`
}

type memberStat struct {
	UserID           string  `json:"user_id"`
	Username         string  `json:"username"`
	Nickname         string  `json:"nickname"`
	Alias            string  `json:"alias"`
	CashIncome       float64 `json:"cash_income"`
	LaborTaskAmount  float64 `json:"labor_task_amount"`
	MentalReward     float64 `json:"mental_energy_reward"`
	TotalLaborIncome float64 `json:"total_labor_income"`
	TotalContrib     float64 `json:"total_contrib"`
	EntryCount       int     `json:"entry_count"`
	EntryPercentage  float64 `json:"entry_percentage"`
	HighestValueTask hvTask  `json:"highest_value_task"`
}

// ─── GetReportSummary ─────────────────────────────────────────────────────────
// GET /api/report/summary?book_id=&period=week&start=2026-05-18&end=2026-05-24

func (h *Handler) GetReportSummary(c *gin.Context) {
	bookID := c.Query("book_id")
	start := c.Query("start")
	end := c.Query("end")
	period := c.Query("period") // week | month

	if bookID == "" || start == "" || end == "" {
		c.JSON(http.StatusBadRequest, fail(400, "book_id, start, end 为必填参数"))
		return
	}

	// 动态读取心力消耗创收单价
	var cfg models.SystemConfig
	mentalReward := 50.0
	if h.DB.Where("config_key = ?", "mental_cost_reward").First(&cfg).Error == nil {
		mentalReward = cfg.ConfigVal
	}

	// 获取成员列表
	var bookMembers []models.BookMember
	h.DB.Where("book_id = ?", bookID).Find(&bookMembers)

	// 获取周期内所有记录
	var allRecords []models.Record
	h.DB.Where(
		"book_id = ? AND occurred_at >= ? AND occurred_at <= ?",
		bookID, start+" 00:00:00", end+" 23:59:59",
	).Find(&allRecords)

	// ── 消费统计 ──────────────────────────────────────────────────────────────
	type catAmt struct {
		Category string  `json:"category"`
		Label    string  `json:"label"`
		Amount   float64 `json:"amount"`
	}
	categoryLabel := map[string]string{
		"food": "餐饮食品", "transport": "交通出行",
		"shopping": "购物消费", "entertainment": "娱乐消遣",
		"medical": "医疗健康", "other": "其他支出",
	}
	expenseMap := map[string]float64{}
	for _, r := range allRecords {
		if r.ItemType == "expense" {
			expenseMap[r.Category] += r.Amount
		}
	}
	expenseList := []catAmt{}
	expenseTotal := 0.0
	for cat, amt := range expenseMap {
		label := categoryLabel[cat]
		if label == "" {
			label = cat
		}
		expenseList = append(expenseList, catAmt{Category: cat, Label: label, Amount: amt})
		expenseTotal += amt
	}

	// ── 成员收入统计 ──────────────────────────────────────────────────────────
	totalEntries := 0
	for _, r := range allRecords {
		if !r.IsMentalEnergyReward {
			totalEntries++
		}
	}

	var stats []memberStat
	for _, bm := range bookMembers {
		var u models.User
		if h.DB.First(&u, "id = ?", bm.UserID).Error != nil {
			continue
		}

		cashIncome := 0.0
		for _, r := range allRecords {
			if r.ItemType == "income" && r.OwnerID == bm.UserID {
				cashIncome += r.Amount
			}
		}

		laborAmt := 0.0
		for _, r := range allRecords {
			if r.ItemType == "task" && r.OwnerID == bm.UserID &&
				r.Status == "completed" && !r.IsMentalEnergyReward {
				laborAmt += r.Amount
			}
		}

		mentalAmt := 0.0
		entryCount := 0
		for _, r := range allRecords {
			if !r.IsMentalEnergyReward && r.CreatorID == bm.UserID {
				entryCount++
			}
			if r.IsMentalEnergyReward && r.CreatorID == bm.UserID {
				mentalAmt += r.Amount
			}
		}

		maxAmt := -1.0
		hv := hvTask{}
		for _, r := range allRecords {
			if r.ItemType == "task" && r.OwnerID == bm.UserID && !r.IsMentalEnergyReward {
				if r.Amount > maxAmt {
					maxAmt = r.Amount
					hv = hvTask{Content: r.Content, Amount: r.Amount}
				}
			}
		}

		pct := 0.0
		if totalEntries > 0 {
			pct = float64(entryCount) / float64(totalEntries) * 100
		}

		stats = append(stats, memberStat{
			UserID: u.ID, Username: u.Username, Nickname: u.Nickname, Alias: bm.Alias,
			CashIncome: cashIncome, LaborTaskAmount: laborAmt,
			MentalReward: mentalAmt, TotalLaborIncome: laborAmt + mentalAmt,
			TotalContrib: cashIncome + laborAmt + mentalAmt,
			EntryCount: entryCount, EntryPercentage: pct,
			HighestValueTask: hv,
		})
	}

	c.JSON(http.StatusOK, ok(gin.H{
		"period":                  gin.H{"type": period, "start": start, "end": end},
		"mental_cost_reward_unit": mentalReward,
		"members":                 stats,
		"expense_summary":         gin.H{"total": expenseTotal, "by_category": expenseList},
		"ai_report":               buildAIReport(stats, period),
	}))
}

// ─── buildAIReport ────────────────────────────────────────────────────────────

func buildAIReport(members []memberStat, period string) gin.H {
	if len(members) == 0 {
		return gin.H{"entry_summary": "暂无数据", "hardwork_praise": "", "full_text": ""}
	}

	periodLabel := "本周"
	if period == "month" {
		periodLabel = "本月"
	}

	topEntry := members[0]
	for _, m := range members[1:] {
		if m.EntryCount > topEntry.EntryCount {
			topEntry = m
		}
	}

	topHW := members[0]
	for _, m := range members[1:] {
		if m.HighestValueTask.Amount > topHW.HighestValueTask.Amount {
			topHW = m
		}
	}

	topLabor := members[0]
	for _, m := range members[1:] {
		if m.TotalLaborIncome > topLabor.TotalLaborIncome {
			topLabor = m
		}
	}

	name := func(m memberStat) string {
		if m.Alias != "" {
			return m.Alias
		}
		return m.Nickname
	}

	entrySummary := fmt.Sprintf("%s%s 承担了 %.0f%% 的任务录入（心力消耗上限）。",
		periodLabel, name(topEntry), topEntry.EntryPercentage)

	hardworkPraise := ""
	if topHW.HighestValueTask.Content != "" {
		hardworkPraise = fmt.Sprintf("「%s」这件累活（¥%.0f），一直都是 %s 在扛！",
			topHW.HighestValueTask.Content, topHW.HighestValueTask.Amount, name(topHW))
	}

	fullText := entrySummary
	if hardworkPraise != "" {
		fullText += " " + hardworkPraise
	}
	if topLabor.TotalLaborIncome > 0 {
		fullText += fmt.Sprintf(" %s%s 劳动创收 ¥%.0f，辛苦了！",
			periodLabel, name(topLabor), topLabor.TotalLaborIncome)
	}

	return gin.H{"entry_summary": entrySummary, "hardwork_praise": hardworkPraise, "full_text": fullText}
}
