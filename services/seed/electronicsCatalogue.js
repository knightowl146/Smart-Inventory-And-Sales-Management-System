/**
 * A generic electronics shop, as a data table.
 *
 * No brand names anywhere. Partly because inventing a catalogue of real
 * manufacturers into a portfolio project invites trademark questions nobody
 * needs, and partly because generic descriptions ("65-inch 4K smart LED
 * television") are what make the AI features legible - a reviewer reading the
 * reorder plan can tell at a glance whether the recommendation is sensible,
 * which they cannot do for a string of model numbers.
 *
 * Prices are INR and roughly market-shaped: a 30-40% gross margin on
 * accessories, thinner on big-ticket items, which is how the real trade works
 * and what makes the margin column on the dashboard worth looking at.
 *
 * Each entry: [name, purchasePrice, sellingPrice, description]
 */

const CATEGORIES = [
  {
    name: "Smartphones",
    prefix: "PHN",
    items: [
      ["Entry Smartphone 64GB", 6200, 7999, "6.5-inch HD+ display, 64GB storage, 4GB RAM, dual rear camera."],
      ["Budget Smartphone 128GB", 9800, 12499, "6.6-inch FHD+ display, 128GB storage, 6GB RAM, 5000mAh battery."],
      ["Mid-Range Smartphone 5G 128GB", 15500, 19999, "5G, 120Hz AMOLED display, 128GB storage, 8GB RAM."],
      ["Mid-Range Smartphone 5G 256GB", 19800, 24999, "5G, 120Hz AMOLED display, 256GB storage, 8GB RAM, 67W charging."],
      ["Flagship Smartphone 256GB", 44000, 54999, "5G flagship, 256GB storage, 12GB RAM, triple 50MP camera system."],
      ["Rugged Smartphone 128GB", 14200, 18499, "IP68 rated, reinforced frame, 6000mAh battery, 128GB storage."],
    ],
  },
  {
    name: "Laptops",
    prefix: "LAP",
    items: [
      ["Student Laptop 14-inch 8GB", 26500, 32999, "14-inch FHD, 8GB RAM, 512GB SSD, integrated graphics."],
      ["Business Laptop 14-inch 16GB", 44000, 54999, "14-inch FHD IPS, 16GB RAM, 512GB SSD, fingerprint reader."],
      ["Thin and Light Laptop 13-inch", 52000, 64999, "13.3-inch 2.8K display, 16GB RAM, 1TB SSD, 1.2kg chassis."],
      ["Gaming Laptop 15-inch RTX", 68000, 84999, "15.6-inch 144Hz, 16GB RAM, 1TB SSD, dedicated 8GB graphics."],
      ["Workstation Laptop 16-inch", 71500, 87999, "16-inch 4K, 32GB RAM, 1TB SSD, colour-calibrated panel."],
      ["Convertible Touch Laptop 14-inch", 47500, 58999, "360-degree hinge, 14-inch touch display, 16GB RAM, stylus included."],
    ],
  },
  {
    name: "Tablets",
    prefix: "TAB",
    items: [
      ["Basic Tablet 10-inch 64GB", 9200, 11999, "10.1-inch HD display, 64GB storage, Wi-Fi only."],
      ["Mid Tablet 11-inch 128GB", 17500, 22499, "11-inch 2K display, 128GB storage, quad speakers."],
      ["Pro Tablet 12-inch 256GB", 38000, 46999, "12.4-inch AMOLED, 256GB storage, stylus and keyboard support."],
      ["Kids Tablet 8-inch", 6800, 8999, "8-inch display, shockproof case, parental controls preloaded."],
    ],
  },
  {
    name: "Audio",
    prefix: "AUD",
    items: [
      ["Wired Earphones", 190, 349, "3.5mm in-ear earphones with inline microphone."],
      ["Wireless Earbuds Entry", 890, 1499, "True wireless earbuds, 20-hour total playback, charging case."],
      ["Wireless Earbuds ANC", 3200, 4499, "Active noise cancellation, 30-hour playback, wireless charging case."],
      ["On-Ear Bluetooth Headphones", 1850, 2799, "40mm drivers, 40-hour playback, foldable design."],
      ["Over-Ear ANC Headphones", 7800, 10999, "Hybrid noise cancellation, 50-hour playback, multipoint pairing."],
      ["Portable Bluetooth Speaker", 1450, 2199, "10W output, IPX7 water resistance, 12-hour playback."],
      ["Party Speaker 60W", 6400, 8999, "60W output, LED lighting, karaoke microphone input."],
      ["Soundbar 2.1 Channel", 5900, 8499, "2.1 channel soundbar with wireless subwoofer, HDMI ARC."],
    ],
  },
  {
    name: "TV and Display",
    prefix: "TVD",
    items: [
      ["32-inch HD Smart TV", 9800, 13499, "32-inch HD Ready LED smart television with streaming apps."],
      ["43-inch FHD Smart TV", 17500, 22999, "43-inch Full HD LED smart television, dual-band Wi-Fi."],
      ["55-inch 4K Smart TV", 30000, 38999, "55-inch 4K UHD LED smart television, HDR10 support."],
      ["65-inch 4K QLED TV", 56000, 69999, "65-inch 4K QLED smart television, 120Hz panel, Dolby Vision."],
      ["24-inch FHD Monitor", 6300, 8499, "24-inch Full HD IPS monitor, 75Hz, HDMI and VGA."],
      ["27-inch QHD Gaming Monitor", 15800, 20499, "27-inch QHD IPS, 165Hz, 1ms response, height adjustable."],
    ],
  },
  {
    name: "Cameras",
    prefix: "CAM",
    items: [
      ["Compact Digital Camera", 11500, 14999, "20MP sensor, 10x optical zoom, Full HD video."],
      ["Mirrorless Camera Kit", 48000, 59999, "24MP APS-C mirrorless body with 18-55mm kit lens."],
      ["Action Camera 4K", 8900, 11999, "4K60 video, waterproof to 10m, electronic stabilisation."],
      ["Security Camera Indoor", 1650, 2499, "1080p indoor pan-tilt camera, night vision, cloud or SD recording."],
    ],
  },
  {
    name: "Wearables",
    prefix: "WER",
    items: [
      ["Fitness Band", 1400, 1999, "Heart rate and SpO2 tracking, 14-day battery, IP68."],
      ["Smartwatch Entry", 2600, 3799, "1.85-inch display, Bluetooth calling, 100+ sport modes."],
      ["Smartwatch AMOLED", 5800, 7999, "1.43-inch AMOLED, GPS, 7-day battery, water resistant."],
      ["Premium Smartwatch", 18500, 23999, "Stainless steel body, built-in GPS, ECG sensor, LTE optional."],
    ],
  },
  {
    name: "Computer Accessories",
    prefix: "ACC",
    items: [
      ["Wired Optical Mouse", 145, 249, "1000 DPI wired optical mouse, USB-A."],
      ["Wireless Mouse", 520, 849, "2.4GHz wireless mouse, 1600 DPI, 12-month battery life."],
      ["Ergonomic Vertical Mouse", 1250, 1899, "Vertical grip wireless mouse, adjustable DPI, rechargeable."],
      ["Wired Keyboard", 420, 699, "Full-size membrane keyboard with numeric pad, USB-A."],
      ["Wireless Keyboard and Mouse Combo", 1150, 1699, "2.4GHz combo, spill-resistant keyboard, plug-and-play receiver."],
      ["Mechanical Keyboard TKL", 3100, 4299, "Tenkeyless mechanical keyboard, hot-swappable switches, RGB."],
      ["Laptop Cooling Pad", 780, 1199, "Five-fan cooling pad with adjustable height and USB pass-through."],
      ["USB-C Docking Station", 3400, 4799, "8-in-1 dock: HDMI, Ethernet, SD reader, 100W power delivery."],
      ["1080p Webcam", 1350, 1999, "1080p30 webcam with dual microphones and privacy shutter."],
      ["Laptop Backpack 15-inch", 890, 1399, "Water-resistant backpack with padded 15.6-inch laptop sleeve."],
    ],
  },
  {
    name: "Storage",
    prefix: "STR",
    items: [
      ["USB Flash Drive 32GB", 210, 379, "32GB USB 3.0 flash drive, metal casing."],
      ["USB Flash Drive 128GB", 620, 999, "128GB USB 3.2 flash drive, up to 150MB/s read."],
      ["MicroSD Card 64GB", 340, 599, "64GB microSDXC, UHS-I U1, adapter included."],
      ["MicroSD Card 256GB", 1250, 1899, "256GB microSDXC, UHS-I U3, 4K video rated."],
      ["Portable SSD 500GB", 3900, 5299, "500GB USB 3.2 portable SSD, up to 1050MB/s."],
      ["External HDD 2TB", 4200, 5699, "2TB portable hard drive, USB 3.0, bus powered."],
    ],
  },
  {
    name: "Power and Cables",
    prefix: "PWR",
    items: [
      ["USB-C Cable 1m", 95, 199, "1m USB-C to USB-A braided cable, 3A rated."],
      ["USB-C to USB-C Cable 2m", 180, 349, "2m USB-C cable, 100W power delivery, e-marked."],
      ["HDMI Cable 2m", 230, 449, "2m HDMI 2.0 cable, 4K60 support."],
      ["Fast Charger 33W", 540, 899, "33W single-port fast charger with cable."],
      ["GaN Charger 65W", 1450, 2199, "65W dual-port GaN charger, USB-C and USB-A."],
      ["Power Bank 10000mAh", 980, 1499, "10000mAh power bank, 22.5W fast charging, dual output."],
      ["Power Bank 20000mAh", 1850, 2699, "20000mAh power bank, 45W USB-C PD, four-LED indicator."],
      ["Surge Protector 6-Socket", 620, 999, "6-socket surge-protected extension board with 2 USB ports."],
      ["Laptop Adapter 65W Universal", 1150, 1749, "Universal 65W laptop adapter with eight interchangeable tips."],
      ["AA Battery Pack of 4", 75, 149, "Pack of four alkaline AA batteries."],
    ],
  },
  {
    name: "Gaming",
    prefix: "GAM",
    items: [
      ["Wired Gaming Controller", 1350, 1999, "Wired controller with dual vibration, PC and console compatible."],
      ["Wireless Gaming Controller", 2900, 3999, "Bluetooth controller, 20-hour battery, motion controls."],
      ["Gaming Headset", 2200, 3199, "Over-ear gaming headset with detachable boom microphone."],
      ["Gaming Mouse RGB", 1600, 2399, "16000 DPI optical sensor, seven programmable buttons, RGB."],
      ["Extended Mouse Pad", 450, 799, "900x400mm stitched-edge desk mat, non-slip base."],
    ],
  },
  {
    name: "Networking and Smart Home",
    prefix: "NET",
    items: [
      ["Wi-Fi Router Dual Band", 1450, 2199, "AC1200 dual-band router, four antennas, parental controls."],
      ["Wi-Fi 6 Router", 3600, 4999, "AX1800 Wi-Fi 6 router, OFDMA, WPA3 security."],
      ["Wi-Fi Range Extender", 1100, 1699, "AC750 range extender, wall plug design, signal indicator."],
      ["Ethernet Cable 5m", 160, 299, "5m Cat6 ethernet patch cable, gigabit rated."],
      ["Smart LED Bulb", 420, 699, "9W Wi-Fi smart bulb, 16 million colours, app and voice control."],
      ["Smart Plug 16A", 680, 1099, "16A Wi-Fi smart plug with energy monitoring."],
      ["Video Doorbell", 3200, 4499, "1080p video doorbell, two-way audio, motion alerts."],
    ],
  },
];

/**
 * Low stock threshold, derived from price rather than fixed at ten.
 *
 * A shop holds a carton of cables and two televisions. A flat threshold either
 * screams about the televisions constantly or never notices the cables running
 * out, and the low-stock alert is one of the first things a reviewer clicks.
 */
const thresholdFor = (sellingPrice) => {
  if (sellingPrice <= 500) return 40;
  if (sellingPrice <= 2000) return 20;
  if (sellingPrice <= 8000) return 10;
  if (sellingPrice <= 25000) return 5;
  return 3;
};

/**
 * Flatten the table into Product documents.
 *
 * `unitPrice` mirrors `sellingPrice`: the schema requires the field and the
 * rest of the app reads sellingPrice, so they must not disagree.
 * `quantity` is left at zero deliberately - seedHistory replays the generated
 * ledger and writes the closing stock, and any figure set here would be
 * overwritten by a number the movements actually support.
 */
const buildCatalogue = () =>
  CATEGORIES.flatMap((category) =>
    category.items.map(([name, purchasePrice, sellingPrice, description], index) => ({
      name,
      sku: `${category.prefix}-${String(index + 1).padStart(3, "0")}`,
      category: category.name,
      purchasePrice,
      sellingPrice,
      unitPrice: sellingPrice,
      quantity: 0,
      lowStockThreshold: thresholdFor(sellingPrice),
      description,
    }))
  );

module.exports = { CATEGORIES, thresholdFor, buildCatalogue };
