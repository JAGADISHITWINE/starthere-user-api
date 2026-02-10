const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const trek = require('../controllers/trek.controlller');
const booking = require('../controllers/booking.controller');
const upcoming = require('../controllers/upcoming.controller');

router.post('/login', ctrl.login);
router.post('/register', ctrl.register);
router.post('/send-otp',    ctrl.sendOtp);
router.post('/verify-otp',  ctrl.verifyOtp);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/validate-reset-token', ctrl.validateResetToken);
router.get('/dashData', trek.getDashboardData);
router.get('/getTrekById/:id', trek.getTrekById);
router.post('/booking', booking.createBookingController);
router.get('/getMyBookingsById/:id',booking.getMyBookingsById);
router.get('/bookings/:userId/:bookingId/receipt', booking.getReceiptById);
router.post('/bookings/:bookingId/cancel', booking.cancleBooking);
router.get('/',upcoming.getAllUpcoming);
router.get('/:id',upcoming.getTrekById);
router.get('/by-month/:year/:month',upcoming.getTrekBymonth);
router.get('/meta/categories',upcoming.getTrekByCategory);
router.get('/stats/monthly/:year',upcoming.getTrekByYear);
router.get('/meta/available-years',upcoming.getAllyear);




module.exports = router;
