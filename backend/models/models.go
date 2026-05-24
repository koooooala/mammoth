package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ─── User ────────────────────────────────────────────────────────────────────

type User struct {
	ID        string    `gorm:"primaryKey"           json:"id"`
	Username  string    `gorm:"uniqueIndex;not null" json:"username"`
	Password  string    `gorm:"not null"             json:"-"`
	Nickname  string    `gorm:"not null;default:''"  json:"nickname"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (u *User) BeforeCreate(_ *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

// ─── Book ────────────────────────────────────────────────────────────────────

type Book struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null"   json:"name"`
	OwnerID   string    `gorm:"not null"   json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (b *Book) BeforeCreate(_ *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return nil
}

// ─── BookMember ──────────────────────────────────────────────────────────────

type BookMember struct {
	ID       string    `gorm:"primaryKey"          json:"id"`
	BookID   string    `gorm:"not null;index"      json:"book_id"`
	UserID   string    `gorm:"not null;index"      json:"user_id"`
	Alias    string    `gorm:"not null;default:''" json:"alias"`
	JoinedAt time.Time `json:"joined_at"`
}

func (bm *BookMember) BeforeCreate(_ *gorm.DB) error {
	if bm.ID == "" {
		bm.ID = uuid.New().String()
	}
	return nil
}

// ─── Invitation ──────────────────────────────────────────────────────────────

type Invitation struct {
	ID        string    `gorm:"primaryKey"     json:"id"`
	BookID    string    `gorm:"not null;index" json:"book_id"`
	InviterID string    `gorm:"not null"       json:"inviter_id"`
	InviteeID string    `gorm:"not null;index" json:"invitee_id"`
	// pending | accepted | rejected
	Status    string    `gorm:"not null;default:'pending'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (i *Invitation) BeforeCreate(_ *gorm.DB) error {
	if i.ID == "" {
		i.ID = uuid.New().String()
	}
	return nil
}

// ─── Record ──────────────────────────────────────────────────────────────────

type Record struct {
	ID        string  `gorm:"primaryKey"     json:"id"`
	BookID    string  `gorm:"not null;index" json:"book_id"`
	// expense | task | income
	ItemType  string  `gorm:"not null"       json:"item_type"`
	// expense: food/transport/shopping/entertainment/medical/other
	// task:    cleaning/cooking/errand/care/maintenance/reminder/mental_energy_reward/other
	// income:  salary/bonus/transfer/investment/other
	Category  string  `gorm:"not null"       json:"category"`
	Content   string  `gorm:"not null"       json:"content"`
	Amount    float64 `gorm:"not null;default:0" json:"amount"`
	OwnerID   string  `gorm:"not null"       json:"owner_id"`
	CreatorID string  `gorm:"not null"       json:"creator_id"`
	OccurredAt time.Time `json:"occurred_at"`
	// pending | completed  (task only; expense 默认 completed)
	Status               string    `gorm:"not null;default:'pending'" json:"status"`
	// 系统自动写入：心力消耗创收奖励 (category=mental_energy_reward 时为 true)
	IsMentalEnergyReward bool      `gorm:"not null;default:false"     json:"is_mental_energy_reward"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

func (r *Record) BeforeCreate(_ *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

// ─── SystemConfig ─────────────────────────────────────────────────────────────
// 通用系统参数键值表，例如 mental_cost_reward=50

type SystemConfig struct {
	ID        string    `gorm:"primaryKey"           json:"id"`
	ConfigKey string    `gorm:"uniqueIndex;not null" json:"config_key"`
	ConfigVal float64   `gorm:"not null;default:0"   json:"config_val"`
	Remark    string    `gorm:"default:''"           json:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (sc *SystemConfig) BeforeCreate(_ *gorm.DB) error {
	if sc.ID == "" {
		sc.ID = uuid.New().String()
	}
	return nil
}

// ─── TaskPricing ─────────────────────────────────────────────────────────────
// 家务/事项标价表，供 LLM 推理金额时作为上下文

type TaskPricing struct {
	ID           string    `gorm:"primaryKey"           json:"id"`
	TaskKeyword  string    `gorm:"uniqueIndex;not null" json:"task_keyword"`
	PresetAmount float64   `gorm:"not null;default:0"   json:"preset_amount"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (tp *TaskPricing) BeforeCreate(_ *gorm.DB) error {
	if tp.ID == "" {
		tp.ID = uuid.New().String()
	}
	return nil
}

// ─── Seed ────────────────────────────────────────────────────────────────────

// SeedDefaults 初始化默认系统配置与事项定价（幂等）
func SeedDefaults(db *gorm.DB) {
	// 系统参数
	sysConfigs := []SystemConfig{
		{ConfigKey: "mental_memory_base", ConfigVal: 50, Remark: "记住/惦记类心力劳动单次估值（元）"},
		{ConfigKey: "coordination_base", ConfigVal: 350, Remark: "协调安排类心力劳动单次估值（元）"},
		{ConfigKey: "research_base", ConfigVal: 120, Remark: "信息搜集类心力劳动单次估值（元）"},
		{ConfigKey: "emotional_support_base", ConfigVal: 220, Remark: "情绪安抚类心力劳动单次估值（元）"},
		{ConfigKey: "emotional_awareness_base", ConfigVal: 80, Remark: "情绪觉察类心力劳动单次估值（元）"},
		{ConfigKey: "relationship_maintenance_base", ConfigVal: 150, Remark: "关系维护类心力劳动单次估值（元）"},
	}
	for _, c := range sysConfigs {
		db.Where(SystemConfig{ConfigKey: c.ConfigKey}).FirstOrCreate(&c)
	}

	// 事项定价
	pricings := []TaskPricing{
		// 4.3 心力劳动估值表
		{TaskKeyword: "记住惦记", PresetAmount: 50},
		{TaskKeyword: "协调安排", PresetAmount: 350},
		{TaskKeyword: "信息搜集", PresetAmount: 120},
		{TaskKeyword: "情绪安抚", PresetAmount: 220},
		{TaskKeyword: "情绪觉察", PresetAmount: 80},
		{TaskKeyword: "关系维护", PresetAmount: 150},

		// 4.4 体力劳动市场价折算
		{TaskKeyword: "日常保洁", PresetAmount: 70},
		{TaskKeyword: "深度清洁", PresetAmount: 125},
		{TaskKeyword: "餐饮做饭", PresetAmount: 85},
		{TaskKeyword: "育儿", PresetAmount: 220},
		{TaskKeyword: "老人照护", PresetAmount: 90},
		{TaskKeyword: "陪诊", PresetAmount: 90},
		{TaskKeyword: "跑腿代办", PresetAmount: 60},

		// 既有预置
		{TaskKeyword: "洗碗", PresetAmount: 20},
		{TaskKeyword: "打扫客厅", PresetAmount: 50},
		{TaskKeyword: "做饭", PresetAmount: 60},
		{TaskKeyword: "倒垃圾", PresetAmount: 10},
		{TaskKeyword: "洗衣服", PresetAmount: 30},
		{TaskKeyword: "辅导作业", PresetAmount: 80},
		{TaskKeyword: "拖地", PresetAmount: 30},
		{TaskKeyword: "采购食材", PresetAmount: 40},
		{TaskKeyword: "医院陪诊", PresetAmount: 100},
		{TaskKeyword: "修理家电", PresetAmount: 80},
		{TaskKeyword: "遛狗", PresetAmount: 20},
		{TaskKeyword: "整理收纳", PresetAmount: 40},
		{TaskKeyword: "缴费", PresetAmount: 15},
		{TaskKeyword: "接送孩子", PresetAmount: 30},
	}
	for _, p := range pricings {
		db.Where(TaskPricing{TaskKeyword: p.TaskKeyword}).FirstOrCreate(&p)
	}
}
