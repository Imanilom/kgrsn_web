package models

import (
	"time"
)

type POStatus string

const (
	PODraft     POStatus = "draft"
	POApproved  POStatus = "approved"
	PODelivered POStatus = "delivered"
	POInvoiced  POStatus = "invoiced"
	POCancelled POStatus = "cancelled"
)

type JenisPO string

const (
	POBahanBaku JenisPO = "bahan_baku"
	POOps       JenisPO = "ops"
)

type PurchaseOrder struct {
	ID            int        `json:"id" gorm:"primaryKey"`
	NomorPO       string     `json:"nomor_po" gorm:"column:nomor_po"`
	DapurID       int        `json:"dapur_id" gorm:"column:dapur_id"`
	TanggalPO     time.Time  `json:"tanggal_po" gorm:"column:tanggal_po;type:date"`
	TanggalKirim  *time.Time `json:"tanggal_kirim" gorm:"column:tanggal_kirim;type:date"`
	Status        POStatus   `json:"status" gorm:"column:status;type:enum('draft','approved','delivered','invoiced','cancelled');default:'draft'"`
	PDFPath       *string    `json:"pdf_path" gorm:"column:pdf_path"`
	TotalNilai    float64    `json:"total_nilai" gorm:"column:total_nilai;type:decimal(15,2)"`
	JumlahPMKecil int        `json:"jumlah_pm_kecil" gorm:"column:jumlah_pm_kecil"`
	JumlahPMBesar int        `json:"jumlah_pm_besar" gorm:"column:jumlah_pm_besar"`
	BudgetKecil   float64    `json:"budget_kecil" gorm:"column:budget_kecil;type:decimal(15,2)"`
	BudgetBesar   float64    `json:"budget_besar" gorm:"column:budget_besar;type:decimal(15,2)"`
	Catatan       *string    `json:"catatan" gorm:"column:catatan"`
	CreatedBy     *int       `json:"created_by" gorm:"column:created_by"`
	ApprovedBy    *int       `json:"approved_by" gorm:"column:approved_by"`
	ApprovedAt    *time.Time `json:"approved_at" gorm:"column:approved_at"`
	CreatedAt     time.Time  `json:"created_at" gorm:"column:created_at"`
	UpdatedAt     time.Time  `json:"updated_at" gorm:"column:updated_at"`
	JenisPO       JenisPO    `json:"jenis_po" gorm:"column:jenis_po;type:enum('bahan_baku','ops');default:'bahan_baku'"`

	Details []PODetail `json:"details" gorm:"foreignKey:POID"`
}

func (PurchaseOrder) TableName() string {
	return "purchase_order"
}

type PODetail struct {
	ID          int     `json:"id" gorm:"primaryKey"`
	POID        int     `json:"po_id" gorm:"column:po_id"`
	ItemID      *int    `json:"item_id" gorm:"column:item_id"`
	NamaItemRaw *string `json:"nama_item_raw" gorm:"column:nama_item_raw"`
	Qty         float64 `json:"qty" gorm:"column:qty;type:decimal(10,3)"`
	Satuan      *string `json:"satuan" gorm:"column:satuan"`
	HargaSatuan float64 `json:"harga_satuan" gorm:"column:harga_satuan;type:decimal(15,2)"`
	HargaJual   float64 `json:"harga_jual" gorm:"column:harga_jual;type:decimal(15,2)"`
	Subtotal    float64 `json:"subtotal" gorm:"column:subtotal;type:decimal(15,2)"`
	Catatan     *string `json:"catatan" gorm:"column:catatan"`
}

func (PODetail) TableName() string {
	return "po_detail"
}
