package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"kgrsn-backend-go/models"

	"gorm.io/gorm"
)

type POHandler struct {
	DB *gorm.DB
}

func NewPOHandler(db *gorm.DB) *POHandler {
	return &POHandler{DB: db}
}

func (h *POHandler) GetPOs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		return
	}

	// Pagination
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")
	
	page := 1
	limit := 10
	
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	offset := (page - 1) * limit

	var pos []models.PurchaseOrder
	var total int64

	// Count total
	if err := h.DB.Model(&models.PurchaseOrder{}).Count(&total).Error; err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal menghitung data PO")
		return
	}

	// Get data with Details
	if err := h.DB.Preload("Details").Order("tanggal_po desc, id desc").Offset(offset).Limit(limit).Find(&pos).Error; err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal mengambil data PO")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"total": total,
		"page":  page,
		"limit": limit,
		"data":  pos,
	})
}

// Helper functions for JSON response
func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}
