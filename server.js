const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, 'qr-code-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(session({
    secret: 'handwriting-secret-key',
    resave: false,
    saveUninitialized: true
}));

const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch(err => console.log("MongoDB Connection Error:", err));

const PaymentSettingSchema = new mongoose.Schema({
    upiId: String,
    qrImageUrl: String
});
const PaymentSetting = mongoose.model('PaymentSetting', PaymentSettingSchema);

const RegistrationSchema = new mongoose.Schema({
    name: String,
    address: String,
    mobile: String,
    pincode: String,
    district: String,
    project: String,
    date: { type: Date, default: Date.now }
});
const Registration = mongoose.model('Registration', RegistrationSchema);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/payment-details', async (req, res) => {
    try {
        let setting = await PaymentSetting.findOne();
        if (!setting) {
            setting = { 
                upiId: '8504823316@thecardco', 
                qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=8504823316@thecardco' 
            };
        }
        res.json(setting);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch payment details' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const newReg = new Registration(req.body);
        await newReg.save();
        res.json({ success: true, message: 'Registration saved successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error saving registration' });
    }
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.redirect('/admin/login');
    }
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.json({ success: true, redirect: '/admin' });
    }
    res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

app.get('/api/admin/registrations', async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
    const registrations = await Registration.find().sort({ date: -1 });
    res.json(registrations);
});

app.post('/api/admin/update-qr', upload.single('qrImage'), async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const { upiId } = req.body;
        let qrImageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

        let setting = await PaymentSetting.findOne();
        if (!setting) {
            setting = new PaymentSetting({ 
                upiId, 
                qrImageUrl: qrImageUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=' + upiId 
            });
        } else {
            if (upiId) setting.upiId = upiId;
            if (qrImageUrl) setting.qrImageUrl = qrImageUrl;
        }
        await setting.save();
        res.json({ success: true, message: 'Payment details updated successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update payment settings' });
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
        
