const { body, query, param } = require('express-validator');

const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('role')
    .optional()
    .isIn(['ADMIN', 'MANAGER', 'VIEWER'])
    .withMessage('Invalid role'),
  
  body('licenseKey')
    .optional()
    .isLength({ min: 10, max: 100 })
    .withMessage('Invalid license key format')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const licenseGenerationValidation = [
  body('type')
    .isIn(['ADMIN', 'MANAGER', 'VIEWER'])
    .withMessage('Invalid license type'),
  
  body('maxUses')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Max uses must be between 1 and 1000'),
  
  body('count')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Count must be between 1 and 100'),
  
  body('expiresAt')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid expiration date'),
  
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters')
];

const contentValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('type')
    .isIn(['video', 'image', 'url', 'html'])
    .withMessage('Invalid content type'),
  
  body('duration')
    .optional()
    .isInt({ min: 1, max: 3600 })
    .withMessage('Duration must be between 1 and 3600 seconds'),
  
  body('url')
    .if(body('type').equals('url'))
    .isURL()
    .withMessage('Please provide a valid URL'),
  
  body('htmlContent')
    .if(body('type').equals('html'))
    .notEmpty()
    .withMessage('HTML content is required for HTML type')
];

module.exports = {
  registerValidation,
  loginValidation,
  licenseGenerationValidation,
  contentValidation
};
