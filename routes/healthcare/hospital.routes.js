// routes/healthcare/hospital.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const HospitalController = require('../../controllers/healthcare/hospital.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { requireModuleAccess } = require('../../middleware/moduleAccess.middleware');
const { checkQuota } = require('../../middleware/usageQuota.middleware');

// Apply module access check to all routes
router.use(requireModuleAccess('healthcare'));

// Create hospital
router.post(
  '/',
  [
    authenticate,
    authorize(['manage_hospitals']),
    checkQuota('healthcare', 'hospitals'),
    check('name', 'Name is required').notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('phone', 'Please include a valid phone number').optional().isMobilePhone()
  ],
  HospitalController.createHospital
);

// Get all hospitals
router.get(
  '/',
  authenticate,
  authorize(['view_hospitals']),
  HospitalController.getHospitals
);

// Get hospital by ID
router.get(
  '/:id',
  authenticate,
  authorize(['view_hospitals']),
  HospitalController.getHospital
);

// Update hospital
router.put(
  '/:id',
  [
    authenticate,
    authorize(['manage_hospitals']),
    check('name', 'Name is required').optional().notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('phone', 'Please include a valid phone number').optional().isMobilePhone()
  ],
  HospitalController.updateHospital
);

// Delete hospital
router.delete(
  '/:id',
  authenticate,
  authorize(['manage_hospitals']),
  HospitalController.deleteHospital
);

// Hospital contacts management
router.post(
  '/:id/contacts',
  [
    authenticate,
    authorize(['manage_hospitals']),
    check('contactName', 'Contact name is required').notEmpty()
  ],
  HospitalController.addContact
);

router.put(
  '/:id/contacts/:contactId',
  [
    authenticate,
    authorize(['manage_hospitals']),
    check('contactName', 'Contact name is required').optional().notEmpty()
  ],
  HospitalController.updateContact
);

router.delete(
  '/:id/contacts/:contactId',
  authenticate,
  authorize(['manage_hospitals']),
  HospitalController.deleteContact
);

// Hospital departments management
router.post(
  '/:id/departments',
  [
    authenticate,
    authorize(['manage_hospitals']),
    check('departmentName', 'Department name is required').notEmpty()
  ],
  HospitalController.addDepartment
);

router.put(
  '/:id/departments/:departmentId',
  [
    authenticate,
    authorize(['manage_hospitals']),
    check('departmentName', 'Department name is required').optional().notEmpty()
  ],
  HospitalController.updateDepartment
);

router.delete(
  '/:id/departments/:departmentId',
  authenticate,
  authorize(['manage_hospitals']),
  HospitalController.deleteDepartment
);

// Hospital statistics
router.get(
  '/statistics/summary',
  authenticate,
  authorize(['view_hospitals']),
  HospitalController.getHospitalStatistics
);

module.exports = router;