require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { Resend } = require('resend');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { createMollieClient } = require('@mollie/api-client');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    helmet({
        contentSecurityPolicy: false,
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    })
);

app.use((req, res, next) => {
    if (req.path === '/api/health') return next(); // Skip redirect for health check
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// Lightweight plain-text health-check endpoint for cron-job keep-alive pings
app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.get('/z-vorm-manage-reset', (req, res) => {
    adminLimiter.resetKey(req.ip);
    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h2 style="color: #f97316;">Rate Limit Cleared Successfully!</h2>
            <p>Your IP address has been cleared from the rate limiter block list.</p>
            <a href="/z-vorm-manage-7842.html" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #f97316; color: white; text-decoration: none; border-radius: 5px;">Return to Admin Portal</a>
        </div>
    `);
});

// Strictly rely on environment variables for authentication
app.use(['/z-vorm-manage-7842.html', '/api/admin'], adminLimiter, basicAuth({
    users: { 
        [process.env.ADMIN_USER]: process.env.ADMIN_PASS 
    },
    challenge: true,
    realm: 'Z-Vorm Admin Portal'
}));

app.use(express.static(path.join(__dirname, 'public')));

// Configure Cloudinary for persistent cloud image & raw file storage
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'z-vorm-catalog',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

const uploadProductImages = multer({ storage: storage });
const contactUpload = multer({ dest: path.join(__dirname, 'uploads/') });

// Initialize Mollie Client using environment variable key
const mollieClient = createMollieClient({ 
    apiKey: process.env.MOLLIE_API_KEY || 'test_VrwxeQfV2SkMpj8u68k5znhEHe8ghp' 
});

// ----------------------------------------------------
// MongoDB Atlas Database Setup & Auto-Migration
// ----------------------------------------------------
const mongoUri = process.env.MONGODB_URI;
let settingsCollection;
let ordersCollection;

async function initDB() {
    if (!mongoUri) {
        console.error("CRITICAL: MONGODB_URI is not set in environment variables.");
        process.exit(1);
    }

    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log("Connected successfully to MongoDB Atlas!");
    
    const db = client.db('zvorm_db');
    settingsCollection = db.collection('settings');
    ordersCollection = db.collection('orders');
    
    const existing = await settingsCollection.findOne({ _id: 'site_settings' });
    
    if (!existing) {
        console.log("No settings found in MongoDB. Initializing automatic migration...");
        let defaultData;
        const localSettingsPath = path.join(__dirname, 'data', 'settings.json');
        
        if (fs.existsSync(localSettingsPath)) {
            console.log("Migrating existing local settings.json to MongoDB...");
            defaultData = JSON.parse(fs.readFileSync(localSettingsPath));
        } else {
            console.log("Creating default catalog...");
            defaultData = {
                calculator: { 
                    powerCostPerKWh: 0.20, 
                    printerWattage: 150, 
                    profitMargin: 0.30, 
                    baseShipping: 7.00,
                    standardShippingFee: 5.00,
                    freeShippingThreshold: 50.00 
                },
                infrastructure: { renderUrl: "https://z-vorm.onrender.com", githubRepo: "JUAL93/Z-Vorm", nasIp: "192.168.1.150", mollieEndpoint: "https://api.mollie.com" },
                categories: ["Shop", "Mounts", "Accessories", "Medals"],
                materials: [
                    { id: "pla", name: "PLA / PLA-PHA", pricePerKg: 20.00, description: "General prototypes.", colors: [{name: "Matte Black", hex: "#111111"}, {name: "Z-Vorm Orange", hex: "#f97316"}] }
                ],
                products: [
                    { id: 1, name: "VeloDock Wall Mount", price: 34.99, description: "Premium bicycle wall mount system.", category: "Shop", sizes: "Standard, XL", isVisible: true, customTextEnabled: false, images: ["/uploads/default.jpg"], colors: [{name: "Matte Black", hex: "#111111"}] }
                ],
                fonts: [
                    { name: "Montserrat", family: "'Montserrat', sans-serif", url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap" },
                    { name: "Futura", family: "'Century Gothic', sans-serif", url: "" },
                    { name: "Impact Stencil", family: "Impact, sans-serif", url: "" }
                ]
            };
        }
        await settingsCollection.insertOne({ _id: 'site_settings', ...defaultData });
        console.log("Migration complete!");
    } else {
        const updateFields = {};
        if (!existing.categories) updateFields.categories = ["Shop", "Mounts", "Accessories", "Medals"];
        if (!existing.fonts) updateFields.fonts = [
            { name: "Montserrat", family: "'Montserrat', sans-serif", url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap" },
            { name: "Futura", family: "'Century Gothic', sans-serif", url: "" },
            { name: "Impact Stencil", family: "Impact, sans-serif", url: "" }
        ];
        if (existing.calculator) {
            if (existing.calculator.standardShippingFee === undefined) updateFields["calculator.standardShippingFee"] = 5.00;
            if (existing.calculator.freeShippingThreshold === undefined) updateFields["calculator.freeShippingThreshold"] = 50.00;
        }
        if (Object.keys(updateFields).length > 0) {
            await settingsCollection.updateOne({ _id: 'site_settings' }, { $set: updateFields });
        }
    }
}

async function getSettings() {
    const data = await settingsCollection.findOne({ _id: 'site_settings' });
    return data;
}

async function saveSettings(data) {
    const { _id, ...updateData } = data;
    await settingsCollection.updateOne(
        { _id: 'site_settings' },
        { $set: updateData },
        { upsert: true }
    );
}

// ----------------------------------------------------
// Express API Routes (Async MongoDB Queries)
// ----------------------------------------------------

app.get('/shop', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

app.get('/api/admin/data', async (req, res) => {
    res.json(await getSettings());
});

app.get('/api/settings', async (req, res) => {
    const settings = await getSettings();
    const materials = settings.materials || [];
    const basePrice = materials.length > 0 ? materials[0].pricePerKg : 20.00;

    const materialsWithDiff = materials.map(m => {
        const diffPercent = Math.round(((m.pricePerKg - basePrice) / basePrice) * 100);
        return {
            ...m,
            diffLabel: diffPercent === 0 ? 'Base Rate' : `${diffPercent > 0 ? '+' : ''}${diffPercent}% vs Base`
        };
    });

    const publicProducts = (settings.products || []).filter(p => p.isVisible !== false);

    res.json({
        calculator: settings.calculator,
        categories: settings.categories || ['Shop'],
        materials: materialsWithDiff,
        products: publicProducts,
        fonts: settings.fonts || []
    });
});

app.post('/api/admin/settings', async (req, res) => {
    const data = await getSettings();
    data.calculator = {
        ...data.calculator,
        ...req.body,
        standardShippingFee: parseFloat(req.body.standardShippingFee) || 5.00,
        freeShippingThreshold: parseFloat(req.body.freeShippingThreshold) || 50.00
    };
    await saveSettings(data);
    res.json({ success: true, message: 'Calculator and shipping settings updated successfully' });
});

app.post('/api/admin/infrastructure', async (req, res) => {
    const data = await getSettings();
    data.infrastructure = req.body;
    await saveSettings(data);
    res.json({ success: true, message: 'Infrastructure settings updated successfully' });
});

// --- Category Management Routes ---
app.post('/api/admin/categories', async (req, res) => {
    const data = await getSettings();
    if (!data.categories) data.categories = ['Shop'];
    
    const newCat = req.body.category ? req.body.category.trim() : '';
    if (newCat && !data.categories.includes(newCat)) {
        data.categories.push(newCat);
        await saveSettings(data);
    }
    res.redirect('/z-vorm-manage-7842.html');
});

app.delete('/api/admin/categories/:name', async (req, res) => {
    const data = await getSettings();
    if (data.categories) {
        data.categories = data.categories.filter(c => c !== req.params.name);
        await saveSettings(data);
    }
    res.json({ success: true });
});

// --- Font Management Routes ---
app.post('/api/admin/fonts', async (req, res) => {
    const data = await getSettings();
    if (!data.fonts) data.fonts = [];
    
    const { name, family, url } = req.body;
    if (name && family) {
        data.fonts.push({
            name: name.trim(),
            family: family.trim(),
            url: url ? url.trim() : ''
        });
        await saveSettings(data);
    }
    res.redirect('/z-vorm-manage-7842.html');
});

app.delete('/api/admin/fonts/:name', async (req, res) => {
    const data = await getSettings();
    if (data.fonts) {
        data.fonts = data.fonts.filter(f => f.name !== req.params.name);
        await saveSettings(data);
    }
    res.json({ success: true });
});

app.post('/api/admin/products', uploadProductImages.array('images', 5), async (req, res) => {
    try {
        const data = await getSettings();
        const imagePaths = req.files && req.files.length > 0 
            ? req.files.map(f => f.path) 
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
            isVisible: req.body.isVisible !== 'false' && req.body.isVisible !== false,
            customTextEnabled: req.body.customTextEnabled === 'true' || req.body.customTextEnabled === true,
            images: imagePaths,
            colors: colors.length > 0 ? colors : [{ name: "Default", hex: "#f97316" }]
        };
        
        data.products.push(newProduct);
        await saveSettings(data);
        res.redirect('/z-vorm-manage-7842.html');
    } catch (err) {
        console.error("Error creating product:", err);
        res.status(500).send("Internal Server Error during product creation.");
    }
});

app.post('/api/admin/products/update/:id', uploadProductImages.array('images', 5), async (req, res) => {
    try {
        const data = await getSettings();
        const product = data.products.find(p => p.id == req.params.id);

        if (product) {
            product.name = req.body.name || product.name;
            product.price = parseFloat(req.body.price) || product.price;
            product.description = req.body.description || product.description || '';
            product.category = req.body.category || product.category || 'Shop';
            product.sizes = req.body.sizes !== undefined ? req.body.sizes.trim() : (product.sizes || '');
            product.leadTimeBadge = req.body.leadTimeBadge !== undefined ? req.body.leadTimeBadge.trim() : (product.leadTimeBadge || '');
            
            if (req.body.isVisible !== undefined) {
                product.isVisible = req.body.isVisible !== 'false' && req.body.isVisible !== false;
            }

            product.customTextEnabled = req.body.customTextEnabled === 'true' || req.body.customTextEnabled === true;
            
            let currentImages = product.images || [];
            let deleteImages = req.body.deleteImages || [];
            if (!Array.isArray(deleteImages)) {
                deleteImages = [deleteImages];
            }

            let retainedImages = currentImages.filter(imgUrl => !deleteImages.includes(imgUrl));

            if (req.body.existingImages) {
                let submittedExisting = Array.isArray(req.body.existingImages) ? req.body.existingImages : [req.body.existingImages];
                retainedImages = retainedImages.filter(imgUrl => submittedExisting.includes(imgUrl));
            }

            const newUploadedImages = req.files && req.files.length > 0 
                ? req.files.map(f => f.path) 
                : [];

            product.images = [...retainedImages, ...newUploadedImages];
            if (product.images.length === 0) product.images = ['/uploads/default.jpg'];

            if (req.body.colorNames && req.body.colorHexes) {
                const names = Array.isArray(req.body.colorNames) ? req.body.colorNames : [req.body.colorNames];
                const hexes = Array.isArray(req.body.colorHexes) ? req.body.colorHexes : [req.body.colorHexes];
                product.colors = names.map((n, i) => ({ name: n, hex: hexes[i] || '#f97316' }));
            }

            await saveSettings(data);
        }
        res.redirect('/z-vorm-manage-7842.html');
    } catch (err) {
        console.error("Error updating product:", err);
        res.status(500).send("Internal Server Error during product update.");
    }
});

app.delete('/api/admin/products/:id', async (req, res) => {
    const data = await getSettings();
    data.products = data.products.filter(p => p.id != req.params.id);
    await saveSettings(data);
    res.json({ success: true });
});

app.post('/api/admin/materials', async (req, res) => {
    const data = await getSettings();
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

    await saveSettings(data);
    res.redirect('/z-vorm-manage-7842.html');
});

app.post('/api/admin/materials/update/:id', async (req, res) => {
    const data = await getSettings();
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

        await saveSettings(data);
    }
    res.redirect('/z-vorm-manage-7842.html');
});

app.delete('/api/admin/materials/:id', async (req, res) => {
    const data = await getSettings();
    data.materials = data.materials.filter(m => m.id != req.params.id);
    await saveSettings(data);
    res.json({ success: true });
});

// ----------------------------------------------------
// Order Management, Print Queue & Analytics Routes
// ----------------------------------------------------

app.get('/api/admin/orders', async (req, res) => {
    if (!ordersCollection) return res.json([]);
    const orders = await ordersCollection.find({}).sort({ date: -1 }).toArray();
    res.json(orders);
});

app.post('/api/admin/orders/update-status/:id', async (req, res) => {
    const { status, assignedPrinter, totalPrice, estimatedWeightKg } = req.body;
    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (assignedPrinter !== undefined) updateFields.assignedPrinter = assignedPrinter;
    if (totalPrice !== undefined) updateFields.totalPrice = parseFloat(totalPrice) || 0;
    if (estimatedWeightKg !== undefined) updateFields.estimatedWeightKg = parseFloat(estimatedWeightKg) || 0;

    await ordersCollection.updateOne(
        { id: req.params.id },
        { $set: updateFields }
    );
    res.json({ success: true });
});

app.delete('/api/admin/orders/:id', async (req, res) => {
    await ordersCollection.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.get('/api/admin/analytics', async (req, res) => {
    if (!ordersCollection) {
        return res.json({ totalRevenue: "0.00", completedOrders: 0, filamentUsed: "0.00", activeQuotes: 0 });
    }

    const orders = await ordersCollection.find({}).toArray();
    
    let totalRevenue = 0;
    let completedOrders = 0;
    let filamentUsed = 0;
    let activeQuotes = 0;
    
    orders.forEach(order => {
        if (order.status === 'Completed' || order.status === 'Shipped') {
            completedOrders++;
            totalRevenue += parseFloat(order.totalPrice || 0);
            filamentUsed += parseFloat(order.estimatedWeightKg || 0);
        } else {
            activeQuotes++;
        }
    });
    
    res.json({ 
        totalRevenue: totalRevenue.toFixed(2), 
        completedOrders, 
        filamentUsed: filamentUsed.toFixed(2), 
        activeQuotes 
    });
});

// ----------------------------------------------------
// Mollie Checkout Payment Route with Dynamic Shipping Calculation
// ----------------------------------------------------
app.post('/api/create-payment', async (req, res) => {
    try {
        if (!process.env.MOLLIE_API_KEY || process.env.MOLLIE_API_KEY.includes('test_your_mollie_api_key_here')) {
            return res.status(400).json({ 
                error: 'Online payments are currently being configured. Please use "Contact Workshop" for your order.' 
            });
        }

        const { cartItems, shippingDetails } = req.body;
        
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Your shopping bag is empty.' });
        }

        const settings = await getSettings();
        const calcSettings = settings.calculator || { standardShippingFee: 5.00, freeShippingThreshold: 50.00 };

        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const shippingFee = subtotal >= (calcSettings.freeShippingThreshold ?? 50.00) ? 0.00 : (calcSettings.standardShippingFee ?? 5.00);
        const totalAmount = subtotal + shippingFee;

        const orderId = 'ORD_' + Date.now();

        const payment = await mollieClient.payments.create({
            amount: {
                currency: 'EUR',
                value: totalAmount.toFixed(2),
            },
            description: `Z-Vorm Webshop Order (${orderId})`,
            redirectUrl: `${req.protocol}://${req.get('host')}/shop?order=success&ref=${orderId}`,
            webhookUrl: `${req.protocol}://${req.get('host')}/api/mollie-webhook`,
            metadata: {
                orderId,
                shippingDetails,
                cartItems,
                subtotal,
                shippingFee
            }
        });

        if (ordersCollection) {
            await ordersCollection.insertOne({
                id: orderId,
                date: new Date().toISOString(),
                customerName: `${shippingDetails.firstName} ${shippingDetails.lastName}`,
                email: shippingDetails.email,
                subject: 'B2C Webshop Order',
                message: `Shipping to: ${shippingDetails.street}, ${shippingDetails.postalCode} ${shippingDetails.city}, ${shippingDetails.country} (Shipping: €${shippingFee.toFixed(2)})`,
                quantity: cartItems.reduce((sum, i) => sum + i.qty, 0),
                status: 'Payment Pending',
                assignedPrinter: 'Unassigned',
                totalPrice: totalAmount,
                estimatedWeightKg: 0
            });
        }

        res.json({ checkoutUrl: payment.getCheckoutUrl() });
    } catch (err) {
        console.error('Mollie payment creation error:', err);
        res.status(500).json({ error: 'Failed to initialize payment gateway.' });
    }
});

// Mollie Webhook Endpoint with Automated Buyer Confirmation & BCC to contact@z-vorm.nl
app.post('/api/mollie-webhook', async (req, res) => {
    const paymentId = req.body.id;
    try {
        const payment = await mollieClient.payments.get(paymentId);
        const orderId = payment.metadata && payment.metadata.orderId;

        if (payment.isPaid()) {
            console.log(`Payment ${paymentId} for order ${orderId} was successfully paid!`);[cite: 6]
            
            const shippingDetails = payment.metadata && payment.metadata.shippingDetails ? payment.metadata.shippingDetails : {};
            const customerEmail = shippingDetails.email;
            const customerName = `${shippingDetails.firstName || ''} ${shippingDetails.lastName || ''}`.trim() || 'Customer';
            const cartItems = payment.metadata && payment.metadata.cartItems ? payment.metadata.cartItems : [];
            const subtotal = payment.metadata && payment.metadata.subtotal ? parseFloat(payment.metadata.subtotal) : 0;
            const shippingFee = payment.metadata && payment.metadata.shippingFee !== undefined ? parseFloat(payment.metadata.shippingFee) : 5.00;

            if (ordersCollection && orderId) {
                await ordersCollection.updateOne(
                    { id: orderId },
                    { $set: { status: 'Paid' } }
                );
            }

            if (process.env.RESEND_API_KEY && customerEmail) {
                try {
                    const resend = new Resend(process.env.RESEND_API_KEY);
                    
                    const itemsListText = cartItems.map(item => 
                        `- ${item.qty}x ${item.name} (${item.color !== 'Standard' ? item.color : ''} ${item.size ? '/ ' + item.size : ''}) : €${(item.price * item.qty).toFixed(2)}`
                    ).join('\n');

                    await resend.emails.send({
                        from: 'Z-Vorm Admin <admin@z-vorm.nl>',
                        to: customerEmail,
                        bcc: 'contact@z-vorm.nl',
                        subject: `Order Confirmation — Z-Vorm (${orderId})`,
                        text: `Hi ${customerName},\n\nThank you for your order! We have received your payment and are preparing your items in our workshop.\n\nOrder Reference: ${orderId}\n\nShipping Address:\n${shippingDetails.street || ''}, ${shippingDetails.postalCode || ''} ${shippingDetails.city || ''} (${shippingDetails.country || ''})\n\nItems Ordered:\n${itemsListText}\n\nSubtotal: €${subtotal.toFixed(2)}\nShipping: ${shippingFee === 0 ? 'FREE' : '€' + shippingFee.toFixed(2)}\nTotal Paid: €${(subtotal + shippingFee).toFixed(2)}\n\nWe will notify you once your order is dispatched.\n\nBest regards,\nThe Z-Vorm Team\nhttps://z-vorm.nl`
                    });
                    console.log(`Order confirmation email successfully dispatched to ${customerEmail} (BCC: contact@z-vorm.nl)`);
                } catch (emailErr) {
                    console.error('Failed to send order confirmation email:', emailErr.message);
                }
            }
        } else if (payment.isCanceled() || payment.isExpired()) {
            console.log(`Payment ${paymentId} was canceled or expired.`);
            if (ordersCollection && orderId) {
                await ordersCollection.updateOne(
                    { id: orderId },
                    { $set: { status: 'Cancelled' } }
                );
            }
        }
        res.status(200).send('Webhook received');
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).send('Webhook processing failed');
    }
});

// ----------------------------------------------------
// Contact & Inquiry Submission Handler with Cloud STL Link & Auto-Responder
// ----------------------------------------------------

app.post('/api/contact', contactUpload.single('attachment'), async (req, res) => {
    const { name, email, subject, message, quantity } = req.body;
    const attachmentFile = req.file;
    console.log(`New Inquiry from ${name} (${email}): ${subject}`);

    let stlCloudUrl = 'None uploaded';

    try {
        if (attachmentFile) {
            const uploadResult = await cloudinary.uploader.upload(attachmentFile.path, {
                folder: 'z-vorm-stl-uploads',
                resource_type: 'raw',
                public_id: `stl_${Date.now()}_${path.basename(attachmentFile.originalname, path.extname(attachmentFile.originalname))}`
            });
            stlCloudUrl = uploadResult.secure_url;
            console.log('STL successfully uploaded to Cloudinary raw storage:', stlCloudUrl);

            fs.unlinkSync(attachmentFile.path);
        }
    } catch (cloudErr) {
        console.error('Failed to upload STL to Cloudinary:', cloudErr);
        if (attachmentFile && fs.existsSync(attachmentFile.path)) {
            fs.unlinkSync(attachmentFile.path);
        }
    }

    if (ordersCollection) {
        try {
            const fullMessage = (message || '') + (stlCloudUrl !== 'None uploaded' ? `\n\nSTL Download Link: ${stlCloudUrl}` : '');
            const newOrder = {
                id: 'ORD_' + Date.now(),
                date: new Date().toISOString(),
                customerName: name || 'Anonymous',
                email: email || 'N/A',
                subject: subject || '3D Print Quote',
                message: fullMessage,
                quantity: parseInt(quantity, 10) || 1,
                status: 'Pending',
                assignedPrinter: 'Unassigned',
                totalPrice: 0,
                estimatedWeightKg: 0
            };
            await ordersCollection.insertOne(newOrder);
            console.log('Order/Inquiry successfully recorded to MongoDB orders collection.');
        } catch (dbErr) {
            console.error('Failed to save order to MongoDB:', dbErr);
        }
    }

    if (process.env.RESEND_API_KEY) {
        try {
            const resend = new Resend(process.env.RESEND_API_KEY);
            
            await resend.emails.send({
                from: 'Z-Vorm Admin <admin@z-vorm.nl>',
                to: 'contact@z-vorm.nl',
                subject: `[Z-Vorm Inquiry] ${subject || 'New Contact Message'}`,
                text: `You have received a new message from your website portal:\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nQuantity: ${quantity || 'N/A'}\n\nMessage:\n${message}\n\n📎 Attached 3D Model / STL Direct Link:\n${stlCloudUrl}`
            });

            if (email) {
                await resend.emails.send({
                    from: 'Z-Vorm Workshop <admin@z-vorm.nl>',
                    to: email,
                    subject: `We've received your 3D printing project — Z-Vorm`,
                    text: `Hi ${name || 'there'},\n\nThank you for reaching out to Z-Vorm! We have successfully received your project files and specifications.\n\nOur engineering team is reviewing your requirements and will get back to you with a formal quote and production timeline shortly.\n\nBest regards,\nThe Z-Vorm Workshop Team\nhttps://z-vorm.nl`
                });
            }
            console.log('Successfully dispatched inquiry email and client auto-responder via Resend.');
        } catch (emailErr) {
            console.error('Failed to send email via Resend:', emailErr.message);
        }
    } else {
        console.log('RESEND_API_KEY not configured. Inquiry logged to console only.');
    }

    res.send(`<script>alert('Project submitted successfully! We will get back to you shortly.'); window.location.href='/';</script>`);
});

// ----------------------------------------------------
// Server Startup
// ----------------------------------------------------

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Z-Vorm server running on http://localhost:${PORT}`);[cite: 6]
    });
}).catch(err => {
    console.error("Failed to connect to database on startup:", err);
});