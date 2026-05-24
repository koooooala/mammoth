package handlers

import (
	"daxiang/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── SendInvitation ───────────────────────────────────────────────────────────

func (h *Handler) SendInvitation(c *gin.Context) {
	bookID := c.Param("id")
	inviterID := c.GetString("user_id")

	var req struct {
		InviteeUsername string `json:"invitee_username" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}

	// 查找被邀请人
	var invitee models.User
	if err := h.DB.Where("username = ?", req.InviteeUsername).First(&invitee).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(404, "用户不存在"))
		return
	}

	// 检查是否已是成员
	var existing models.BookMember
	if h.DB.Where("book_id = ? AND user_id = ?", bookID, invitee.ID).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, fail(409, "该用户已是账本成员"))
		return
	}

	// 检查是否已有 pending 邀请
	var pendingInv models.Invitation
	if h.DB.Where("book_id = ? AND invitee_id = ? AND status = ?", bookID, invitee.ID, "pending").
		First(&pendingInv).Error == nil {
		c.JSON(http.StatusConflict, fail(409, "已发送过邀请，等待对方确认"))
		return
	}

	inv := models.Invitation{
		BookID:    bookID,
		InviterID: inviterID,
		InviteeID: invitee.ID,
		Status:    "pending",
	}
	if err := h.DB.Create(&inv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, fail(500, "发送邀请失败"))
		return
	}

	c.JSON(http.StatusOK, ok(gin.H{"invitation_id": inv.ID, "status": inv.Status}))
}

// ─── GetInvitations ───────────────────────────────────────────────────────────

func (h *Handler) GetInvitations(c *gin.Context) {
	uid := c.GetString("user_id")
	statusFilter := c.Query("status") // 可选，默认不过滤

	type InvItem struct {
		ID        string    `json:"id"`
		BookID    string    `json:"book_id"`
		BookName  string    `json:"book_name"`
		Inviter   gin.H     `json:"inviter"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
	}

	var invitations []models.Invitation
	q := h.DB.Where("invitee_id = ?", uid)
	if statusFilter != "" {
		q = q.Where("status = ?", statusFilter)
	}
	q.Order("created_at desc").Find(&invitations)

	result := make([]InvItem, 0, len(invitations))
	for _, inv := range invitations {
		var book models.Book
		h.DB.First(&book, "id = ?", inv.BookID)
		var inviter models.User
		h.DB.First(&inviter, "id = ?", inv.InviterID)

		result = append(result, InvItem{
			ID:       inv.ID,
			BookID:   inv.BookID,
			BookName: book.Name,
			Inviter:  gin.H{"username": inviter.Username, "nickname": inviter.Nickname},
			Status:   inv.Status,
			CreatedAt: inv.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, ok(result))
}

// ─── RespondToInvitation ──────────────────────────────────────────────────────

func (h *Handler) RespondToInvitation(c *gin.Context) {
	invID := c.Param("id")
	uid := c.GetString("user_id")

	var req struct {
		Action string `json:"action" binding:"required"` // accepted | rejected
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, fail(400, err.Error()))
		return
	}
	if req.Action != "accepted" && req.Action != "rejected" {
		c.JSON(http.StatusBadRequest, fail(400, "action 必须为 accepted 或 rejected"))
		return
	}

	var inv models.Invitation
	if err := h.DB.Where("id = ? AND invitee_id = ?", invID, uid).First(&inv).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(404, "邀请不存在"))
		return
	}
	if inv.Status != "pending" {
		c.JSON(http.StatusConflict, fail(409, "该邀请已处理"))
		return
	}

	h.DB.Model(&inv).Update("status", req.Action)

	// 若接受，则将其加入账本成员
	if req.Action == "accepted" {
		member := models.BookMember{
			BookID:   inv.BookID,
			UserID:   uid,
			JoinedAt: time.Now(),
		}
		h.DB.Where(models.BookMember{BookID: inv.BookID, UserID: uid}).FirstOrCreate(&member)
	}

	c.JSON(http.StatusOK, ok(gin.H{"invitation_id": inv.ID, "status": req.Action}))
}
