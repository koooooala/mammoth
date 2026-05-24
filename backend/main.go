package main

import (
	"daxiang/handlers"
	"daxiang/middleware"
	"daxiang/models"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	// ── 数据库初始化 ──────────────────────────────────────────────────────────
	db, err := gorm.Open(sqlite.Open("daxiang.db"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	// AutoMigrate 自动建表/升级
	if err := db.AutoMigrate(
		&models.User{},
		&models.Book{},
		&models.BookMember{},
		&models.Invitation{},
		&models.Record{},
		&models.SystemConfig{},
		&models.TaskPricing{},
	); err != nil {
		log.Fatal("数据库迁移失败:", err)
	}

	// 预置默认数据（幂等）
	models.SeedDefaults(db)

	// ── 路由初始化 ────────────────────────────────────────────────────────────
	r := gin.Default()

	// 全局 CORS 中间件
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization", "Accept"},
		ExposeHeaders:   []string{"Content-Length"},
	}))

	h := handlers.NewHandler(db)
	api := r.Group("/api")

	// ── 公开接口（无需鉴权）───────────────────────────────────────────────────
	api.POST("/auth/register", h.Register)
	api.POST("/auth/login", h.Login)

	// ── 需要鉴权的接口 ────────────────────────────────────────────────────────
	auth := api.Group("", middleware.JWTAuth())

	// 用户搜索 & 修改资料
	auth.GET("/users/search", h.SearchUsers)
	auth.PUT("/users/me", h.UpdateProfile)

	// 账本
	auth.GET("/books", h.GetBooks)
	auth.POST("/books", h.CreateBook)
	auth.GET("/books/:id/members", h.GetBookMembers)
	auth.PUT("/books/:id/members/:userId", h.UpdateMemberAlias)
	auth.GET("/books/:id/records", h.GetDailyRecords)
	auth.POST("/books/:id/invite", h.SendInvitation)

	// 记录
	auth.POST("/records/batch", h.BatchCreateRecords)
	auth.PUT("/records/:id", h.UpdateRecord)
	auth.DELETE("/records/:id", h.DeleteRecord)

	// 邀请
	auth.GET("/invitations", h.GetInvitations)
	auth.POST("/invitations/:id/respond", h.RespondToInvitation)

	// AI 解析
	auth.POST("/ai/parse", h.AIParseInput)
	auth.POST("/ai/parse-voice", h.AIParseVoice)
	auth.POST("/ai/parse-voice-stream", h.AIParseVoiceStream)

	// 总览报表
	auth.GET("/report/summary", h.GetReportSummary)

	// 系统配置（读取）
	auth.GET("/system-configs", h.GetSystemConfigs)
	// 系统配置（写入，演示用，实际可加权限）
	auth.POST("/config/update", h.UpdateConfig)

	// ── 启动服务 ──────────────────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("🐘 大象记账后端启动，监听端口 :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("服务启动失败:", err)
	}
}
