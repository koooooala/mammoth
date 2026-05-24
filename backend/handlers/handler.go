package handlers

import "gorm.io/gorm"

// Handler 持有数据库连接，所有业务 handler 挂载于此
type Handler struct {
	DB *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{DB: db}
}

// ok 统一成功响应
func ok(data interface{}) map[string]interface{} {
	return map[string]interface{}{"code": 0, "message": "ok", "data": data}
}

// fail 统一错误响应
func fail(code int, message string) map[string]interface{} {
	return map[string]interface{}{"code": code, "message": message}
}
