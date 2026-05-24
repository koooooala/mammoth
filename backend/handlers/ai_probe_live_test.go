package handlers

import (
	"bytes"
	"daxiang/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestProbeAILiveCall(t *testing.T) {
	gin.SetMode(gin.TestMode)
	if os.Getenv("ARK_API_KEY") == "" {
		t.Skip("ARK_API_KEY not set")
	}

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Book{}, &models.BookMember{}, &models.TaskPricing{}); err != nil {
		t.Fatal(err)
	}

	leah := models.User{Username: "leah", Password: "x", Nickname: "Leah"}
	vivian := models.User{Username: "vivian", Password: "x", Nickname: "Vivian"}
	db.Create(&leah)
	db.Create(&vivian)
	book := models.Book{Name: "demo", OwnerID: leah.ID}
	db.Create(&book)
	db.Create(&models.BookMember{BookID: book.ID, UserID: leah.ID, Alias: "莉娅"})
	db.Create(&models.BookMember{BookID: book.ID, UserID: vivian.ID, Alias: "薇薇"})
	db.Create(&models.TaskPricing{TaskKeyword: "拖地", PresetAmount: 30})
	db.Create(&models.TaskPricing{TaskKeyword: "洗碗", PresetAmount: 20})

	h := NewHandler(db)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", leah.ID)
		c.Next()
	})
	r.POST("/api/ai/parse", h.AIParseInput)

	payload := map[string]any{"book_id": book.ID, "input_text": "我今天拖了地，洗了碗"}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/ai/parse", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	t.Logf("status=%d", w.Code)
	t.Logf("body=%s", w.Body.String())
}
