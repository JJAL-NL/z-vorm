const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'public/uploads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const settingsPath = path.join(dataDir, 'settings.json');
if (!fs.existsSync(settingsPath)) {
    const defaultData = {
        calculator: {
            powerCostPerKWh: 0.20,
            printerWattage: 150,
            profitMargin: 0.30,
            baseShipping: 7.00
        },
        materials: [
            { id: "pla", name: "PLA / PLA-PHA", pricePerKg: 20.00, description: "General prototypes, visual models, and eco-friendly tough prints.", colors: [{name: "Matte Black", hex: "#111111"}, {name: "Pure White", hex: "#f8fafc"}, {name: "Z-Vorm Orange", hex: "#f97316"}] },
            { id: "petg", name: "PETG & ColorFabb", pricePerKg: 28.00, description: "Durable mechanical parts with chemical and UV resistance.", colors: [{name: "Carbon Black", hex: "#1e293b"}, {name: "Transparent", hex: "#94a3b8"}] }
        ],
        products: [
            { id: 1, name: "VeloDock Wall Mount", price: 34.99, description: "Premium bicycle wall mount system.", category: "Shop", sizes: "Standard, XL", leadTimeBadge: "In Stock - Dispatched in 48h", customTextEnabled: false, images: ["/uploads/default.jpg"], colors: [{name: "Matte Black", hex: "#111111"}] },
            { id: 2, name: "Hexagon Medal Hanger", price: 24.99, description: "Modular medal display system.", category: "Shop", sizes: "Standard", leadTimeBadge: "Made-to-Order (3-5 days)", customTextEnabled: true, images: ["/uploads/default.jpg"], colors: [{name: "Z-Vorm Orange", hex: "#f97316"}] }
        ]
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaultData, null, 2));
}

const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const uploadProductImages = multer({ storage: productStorage });
const contactUpload = multer({ dest: path.join(__dirname, 'uploads/') });

function getSettings() {
    const raw = fs.readFileSync(settingsPath);
    return JSON.parse(raw);
}

app.get('/api/admin/data', (req, res) => {
    res.json(getSettings());
});

app.get('/api/settings', (req, res) => {
    const settings = getSettings();
    const materials = settings.materials || [];
    const basePrice = materials.length > 0 ? materials[0].pricePerKg : 20.00;

    const materialsWithDiff = materials.map(m => {
        const diffPercent = Math.round(((m.pricePerKg - basePrice) / basePrice) * 100);
        return {
            ...m,
            diffLabel: diffPercent === 0 ? 'Base Rate' : `${diffPercent > 0 ? '+' : ''}${diffPercent}% vs Base`
        };
    });

    res.json({
        calculator: settings.calculator,
        materials: materialsWithDiff,
        products: settings.products
    });
});

app.post('/api/admin/settings', (req, res) => {
    const data = getSettings();
    data.calculator = req.body;
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Calculator settings updated successfully' });
});

// Add Product with Multiple Images, Colors, Sizes, Lead Time, and Custom Text Support
app.post('/api/admin/products', uploadProductImages.array('images', 5), (req, res) => {
    const data = getSettings();
    const imagePaths = req.files && req.files.length > 0 
        ? req.files.map(f => `/uploads/${f.filename}`) 
        : ['/uploads/default.jpg'];

    let colors = [];
    if (req.body.colorNames && req.body.colorHexes) {
        const names = Array.isArray(req.body.colorNames) ? req.body.colorNames : [req.body.colorNames];
        const hexes = Array.isArray(req.body.colorHexes) ? req.body.colorHexes : [req.body.colorHexes];
        colors = names.map((n, i) => ({ name: n, hex: hexes[i] || '#f97316' }));
    }

    const newProduct = {
        id: Date.now(),
        name: req.body.name,
        price: parseFloat(req.body.price),
        description: req.body.description || '',
        category: req.body.category || 'Shop',
        sizes: req.body.sizes ? req.body.sizes.trim() : '',
        leadTimeBadge: req.body.leadTimeBadge ? req.body.leadTimeBadge.trim() : '',
        customTextEnabled: req.body.customTextEnabled === 'true' || req.body.customTextEnabled === true,
        images: imagePaths,
        colors: colors.length > 0 ? colors : [{ name: "Default", hex: "#f97316" }]
    };
    
    data.products.push(newProduct);
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    res.redirect('/admin.html');
});

// Update Product with Customization Fields
app.post('/api/admin/products/update/:id', uploadProductImages.array('images', 5), (req, res) => {
    const data = getSettings();
    const product = data.products.find(p => p.id == req.params.id);

    if (product) {
        product.name = req.body.name || product.name;
        product.price = parseFloat(req.body.price) || product.price;
        product.description = req.body.description || product.description || '';
        product.sizes = req.body.sizes !== undefined ? req.body.sizes.trim() : (product.sizes || '');
        product.leadTimeBadge = req.body.leadTimeBadge !== undefined ? req.body.leadTimeBadge.trim() : (product.leadTimeBadge || '');
        product.customTextEnabled = req.body.customTextEnabled === 'true' || req.body.customTextEnabled === true;
        
        if (req.files && req.files.length > 0) {
            product.images = req.files.map(f => `/uploads/${f.filename}`);
        }

        if (req.body.colorNames && req.body.colorHexes) {
            const names = Array.isArray(req.body.colorNames) ? req.body.colorNames : [req.body.colorNames];
            const hexes = Array.isArray(req.body.colorHexes) ? req.body.colorHexes : [req.body.colorHexes];
            product.colors = names.map((n, i) => ({ name: n, hex: hexes[i] || '#f97316' }));
        }

        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    }
    res.redirect('/admin.html');
});

app.delete('/api/admin/products/:id', (req, res) => {
    const data = getSettings();
    data.products = data.products.filter(p => p.id != req.params.id);
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// Add Material with Color Palette Objects & Price per kg
app.post('/api/admin/materials', (req, res) => {
    const data = getSettings();
    const { name, pricePerKg, description, colorNames, colorHexes } = req.body;
    
    if (!data.materials) data.materials = [];
    
    let colors = [];
    if (colorNames && colorHexes) {
        const names = Array.isArray(colorNames) ? colorNames : [colorNames];
        const hexes = Array.isArray(colorHexes) ? colorHexes : [colorHexes];
        colors = names.map((n, i) => ({ name: n, hex: hexes[i] || '#f97316' }));
    }

    data.materials.push({
        id: name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(),
        name,
        pricePerKg: parseFloat(pricePerKg),
        description: description || '',
        colors: colors.length > 0 ? colors : [{name: "Default", hex: "#f97316"}]
    });

    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    res.redirect('/admin.html');
});

// Update Material
app.post('/api/admin/materials/update/:id', (req, res) => {
    const data = getSettings();
    const material = data.materials.find(m => m.id == req.params.id);

    if (material) {
        material.name = req.body.name || material.name;
        material.pricePerKg = parseFloat(req.body.pricePerKg) || material.pricePerKg;
        material.description = req.body.description || material.description || '';
        
        if (req.body.colorNames && req.body.colorHexes) {
            const names = Array.isArray(req.body.colorNames) ? req.body.colorNames : [req.body.colorNames];
            const hexes = Array.isArray(req.body.colorHexes) ? req.body.colorHexes : [req.body.colorHexes];
            material.colors = names.map((n, i) => ({ name: n, hex: hexes[i] || '#f97316' }));
        }

        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    }
    res.redirect('/admin.html');
});

app.delete('/api/admin/materials/:id', (req, res) => {
    const data = getSettings();
    data.materials = data.materials.filter(m => m.id != req.params.id);
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

app.post('/api/contact', contactUpload.single('attachment'), (req, res) => {
    const { name, email, subject, message } = req.body;
    console.log(`New Inquiry from ${name} (${email}): ${subject} - ${message}`);
    res.send(`<script>alert('Project submitted successfully! We will get back to you shortly.'); window.location.href='/';</script>`);
});

app.listen(PORT, () => {
    console.log(`Z-Vorm server running on http://localhost:${PORT}`);
});