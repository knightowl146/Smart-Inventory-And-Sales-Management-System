const express = require("express");
const router = express.Router();

const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  purchaseProduct,
  sellProduct,
} = require("../controllers/productController");
const { requireAuth } = require("../middlewares/auth");
const { can } = require("../middlewares/permissions");

router.use(requireAuth);

// Employees may read the catalogue - responseFilter removes purchasePrice from
// what they get back - and may record a sale. Everything else is the owner's.
router.post("/", can("product:create"), createProduct);
router.get("/", can("product:read"), getProducts);
router.get("/:id", can("product:read"), getProductById);
router.patch("/:id", can("product:update"), updateProduct);
router.delete("/:id", can("product:delete"), deleteProduct);

router.post("/:id/purchase", can("product:purchase"), purchaseProduct);
router.put("/:id/purchase", can("product:purchase"), purchaseProduct);

router.post("/:id/sell", can("product:sell"), sellProduct);
router.put("/:id/sell", can("product:sell"), sellProduct);

module.exports = router;
