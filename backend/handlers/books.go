package handlers

import (
	"daxiang/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── GetBooks ─────────────────────────────────────────────────────────────────

func (h *Handler) GetBooks(c *gin.Context) {
	uid := c.GetString("user_id")

	// 找到该用户所在的所有 BookMember 记录
	var members []models.BookMember
	h.DB.Where("user_id = ?", uid).Find(&members)

	type BookItem struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		OwnerID     string    `json:"owner_id"`
		MemberCount int64     `json:"member_count"`
		MyAlias     string    `json:"my_alias"`
		CreatedAt   time.Time `json:"created_at"`
	}

	result := make([]BookItem, 0, len(members))
	for _, m := range members {
		var book models.Book
		if err := h.DB.First(&book, "id = ?", m.BookID).Error; err != nil {
			continue
		}
		var cnt int64
		h.DB.Model(&models.BookMember{}).Where("book_id = ?", book.ID).Count(&cnt)
		result = append(result, BookItem{
			ID:          book.ID,
			Name:        book.Name,
			OwnerID:     book.OwnerID,
			MemberCount: cnt,
			MyAlias:     m.Alias,
			CreatedAt:   book.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, ok(result))
}

// ─── CreateBook ──────────────────────────────────────────────────────────────

func (h *Handler) CreateBook(c *gin.Context) {
	uid := c.GetString("user_id")

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	book := models.Book{Name: req.Name, OwnerID: uid}
	if err := h.DB.Create(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "创建账本失败"))
		return
	}

	// 创建者自动加入账本
	member := models.BookMember{BookID: book.ID, UserID: uid, JoinedAt: time.Now()}
	h.DB.Create(&member)

	c.JSON(http.StatusOK, ok(book))
}

// ─── GetBookMembers ───────────────────────────────────────────────────────────

func (h *Handler) GetBookMembers(c *gin.Context) {
	bookID := c.Param("id")

	var members []models.BookMember
	h.DB.Where("book_id = ?", bookID).Find(&members)

	type MemberItem struct {
		UserID   string    `json:"user_id"`
		Username string    `json:"username"`
		Nickname string    `json:"nickname"`
		Alias    string    `json:"alias"`
		JoinedAt time.Time `json:"joined_at"`
	}

	result := make([]MemberItem, 0, len(members))
	for _, m := range members {
		var u models.User
		if err := h.DB.First(&u, "id = ?", m.UserID).Error; err != nil {
			continue
		}
		result = append(result, MemberItem{
			UserID:   u.ID,
			Username: u.Username,
			Nickname: u.Nickname,
			Alias:    m.Alias,
			JoinedAt: m.JoinedAt,
		})
	}

	c.JSON(http.StatusOK, ok(result))
}

// ─── UpdateMemberAlias ────────────────────────────────────────────────────────

func (h *Handler) UpdateMemberAlias(c *gin.Context) {
	bookID := c.Param("id")
	userID := c.Param("userId")

	var req struct {
		Alias string `json:"alias"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	h.DB.Model(&models.BookMember{}).
		Where("book_id = ? AND user_id = ?", bookID, userID).
		Update("alias", req.Alias)

	c.JSON(http.StatusOK, ok(gin.H{"updated": true}))
}
