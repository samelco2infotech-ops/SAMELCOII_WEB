const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const uploadDir = path.resolve(__dirname, '../../../', config.uploads.uploadDir);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const profilePhotosDir = path.join(uploadDir, 'profile-photos');
if (!fs.existsSync(profilePhotosDir)) {
  fs.mkdirSync(profilePhotosDir, { recursive: true });
}

const messengerDir = path.join(uploadDir, 'messenger');
if (!fs.existsSync(messengerDir)) {
  fs.mkdirSync(messengerDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = req.uploadDir || 'profile-photos';
    const dest = path.join(uploadDir, subdir);

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    cb(null, `${name}_${timestamp}_${random}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  const ext = path.extname(file.originalname).toLowerCase();

  if (!config.uploads.allowedMimes.includes(mime)) {
    return cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
  }

  if (!config.uploads.allowedExtensions.includes(ext)) {
    return cb(new Error('Invalid file extension.'));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.uploads.maxFileSize,
  },
});

const uploadProfilePhoto = upload.single('file');

const uploadMessengerFile = upload.single('file');

module.exports = {
  upload,
  uploadProfilePhoto,
  uploadMessengerFile,
};
