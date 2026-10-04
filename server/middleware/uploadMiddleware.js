const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage for Excel uploads
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadsDir, 'excel', `user_${req.user ? req.user.id : 'temp'}`);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `excel-${uniqueSuffix}${ext}`);
  }
});

const excelFilter = (req, file, cb) => {
  const allowedExts = ['.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only .xlsx and .xls Excel files are allowed.'));
  }
};

const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Storage for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadsDir, 'pdfs', `user_${req.user ? req.user.id : 'temp'}`);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // Keep clean filename for matching, but avoid collision
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const safeName = basename.replace(/[^a-zA-Z0-9\s_-]/g, '_');
    cb(null, `${safeName}${ext}`);
  }
});

const pdfFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files (.pdf) are allowed.'));
  }
};

const uploadPdf = multer({
  storage: pdfStorage,
  fileFilter: pdfFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per PDF
});

module.exports = {
  uploadExcel,
  uploadPdf
};
