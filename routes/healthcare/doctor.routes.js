// routes/healthcare/doctor.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const DoctorController = require('../../controllers/healthcare/doctor.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');const { requireModuleAccess } = require('../../middleware/moduleAccess.middleware');
const { checkQuota } = require('../../middleware/usageQuota.middleware');
const fileUpload = require('../../middleware/fileUpload.middleware');

// Apply module access check to all routes
router.use(requireModuleAccess('healthcare'));

// Create doctor
router.post(
  '/',
  [
    authenticate,
  authorize(['manage_doctors']),
    checkQuota('healthcare', 'doctors'),
    check('name', 'Name is required').notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('phone', 'Please include a valid phone number').optional().isMobilePhone()
  ],
  DoctorController.createDoctor
);

// Get all doctors
router.get(
  '/',

  authenticate,
  authorize(['view_doctors']),
  DoctorController.getDoctors
);

// Get doctor by ID
router.get(
  '/:id',

  authenticate,
  authorize(['view_doctors']),
  DoctorController.getDoctor
);

// Update doctor
router.put(
  '/:id',
  [
    authenticate,
  authorize(['manage_doctors']),
    check('name', 'Name is required').optional().notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('phone', 'Please include a valid phone number').optional().isMobilePhone()
  ],
  DoctorController.updateDoctor
);

// Delete doctor
router.delete(
  '/:id',
  authenticate,
  authorize(['manage_doctors']),
  DoctorController.deleteDoctor
);

// Add hospital association
router.post(
  '/:id/hospital-associations',
  [
    authenticate,
  authorize(['manage_doctors']),
    check('hospitalId', 'Hospital ID is required').notEmpty(),
    check('role', 'Role is required').optional()
  ],
  DoctorController.addHospitalAssociation
);

// Add specialty
router.post(
  '/:id/specialties',
  [
    authenticate,
  authorize(['manage_doctors']),
    check('specialtyName', 'Specialty name is required').notEmpty()
  ],
  DoctorController.addSpecialty
);

// Add meeting
router.post(
  '/:id/meetings',
  [
    authenticate,
  authorize(['manage_doctors']),
    check('meetingDate', 'Meeting date is required').isISO8601(),
    check('meetingType', 'Meeting type is required').notEmpty()
  ],
  DoctorController.addMeeting
);

// Upload document
router.post(
  '/:id/documents',
  [
    authenticate,
  authorize(['manage_doctors']),
    fileUpload.single('document'),
    check('documentType', 'Document type is required').notEmpty()
  ],
  DoctorController.uploadDocument
);

// Get case history
router.get(
  '/:id/case-history',
  authenticate,
  authorize(['view_doctors']),
  DoctorController.getCaseHistory
);

// Get upcoming follow-ups
router.get(
  '/follow-ups/upcoming',
  authenticate,
  authorize(['view_doctors']),
  DoctorController.getUpcomingFollowUps
);

// Get doctor statistics
router.get(
  '/statistics/summary',
  authenticate,
  authorize(['view_doctors']),
  DoctorController.getDoctorStatistics
);

module.exports = router;