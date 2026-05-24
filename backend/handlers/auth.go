package handlers

import (
	"daxiang/models"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// ─── Register ────────────────────────────────────────────────────────────────

func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "密码加密失败"))
		return
	}

	nickname := req.Nickname
	if nickname == "" {
		nickname = req.Username
	}

	user := models.User{
		Username: req.Username,
		Password: string(hash),
		Nickname: nickname,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, fail(409, "用户名已存在"))
		return
	}

	token, err := generateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "Token 生成失败"))
		return
	}

	c.JSON(http.StatusOK, ok(gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "username": user.Username, "nickname": user.Nickname},
	}))
}

// ─── Login ───────────────────────────────────────────────────────────────────

func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	var user models.User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, fail(401, "用户名或密码错误"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, fail(401, "用户名或密码错误"))
		return
	}

	token, err := generateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "Token 生成失败"))
		return
	}

	c.JSON(http.StatusOK, ok(gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "username": user.Username, "nickname": user.Nickname},
	}))
}

// ─── UpdateProfile ────────────────────────────────────────────────────────────

func (h *Handler) UpdateProfile(c *gin.Context) {
	uid := c.GetString("user_id")

	var req struct {
		Nickname string `json:"nickname"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", uid).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(404, "用户不存在"))
		return
	}

	if req.Nickname != "" {
		user.Nickname = req.Nickname
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, fail(500, "密码加密失败"))
			return
		}
		user.Password = string(hash)
	}

	h.DB.Save(&user)
	c.JSON(http.StatusOK, ok(gin.H{
		"id": user.ID, "username": user.Username, "nickname": user.Nickname,
	}))
}

// ─── SearchUsers ─────────────────────────────────────────────────────────────

func (h *Handler) SearchUsers(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusBadRequest, fail(400, "搜索关键词不能为空"))
		return
	}

	currentUID := c.GetString("user_id")
	var users []models.User
	h.DB.Where("username LIKE ? AND id != ?", "%"+q+"%", currentUID).
		Limit(10).Find(&users)

	list := make([]gin.H, 0, len(users))
	for _, u := range users {
		list = append(list, gin.H{"id": u.ID, "username": u.Username, "nickname": u.Nickname})
	}
	c.JSON(http.StatusOK, ok(list))
}

// ─── internal ────────────────────────────────────────────────────────────────

func generateToken(userID string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "daxiang-hackathon-secret-2026"
	}
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
