const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const trek = require('../controllers/trek.controlller');
const booking = require('../controllers/booking.controller');
const upcoming = require('../controllers/upcoming.controller');
const blogController = require('../controllers/blog.controller');
const metaController = require('../controllers/meta.controller');
const upload = require('../middleware/upload'); 
const { requireAuth } = require('../middleware/auth');

// ========== AUTH ROUTES ==========
router.post('/login', ctrl.login);
router.post('/register', ctrl.register);
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/validate-reset-token', ctrl.validateResetToken);

// ========== DASHBOARD ROUTES ==========
router.get('/dashData', trek.getDashboardData);

// ========== META DROPDOWNS ==========
router.get('/meta/dropdowns/:type', metaController.getDropdownByType);

// ========== TREK ROUTES ==========
router.get('/getTrekByUuid/:id', trek.getTrekById);
router.get('/getAllTreks', trek.getAllTreks);

// ========== BOOKING ROUTES ==========
router.post('/booking', booking.createBookingController);
router.post('/coupon/validate', booking.validateCouponController);
router.get('/coupons/trek/:trekId', booking.getAvailableCouponsController);
router.get('/getMyBookingsById/:id', booking.getMyBookingsById);
router.get('/bookings/:userId/:bookingId/receipt', booking.getReceiptById);
router.post('/bookings/:userId/:bookingId/rating', booking.submitTrekRating);
router.post('/bookings/:bookingId/cancel', booking.cancelBooking);

// Public routes
router.get('/blog/posts/related', blogController.getRelatedPosts);
router.get('/blog/posts', blogController.getAllPosts);
router.get('/blog/posts/:id', blogController.getPostById);
router.get('/blog/posts/:id/comments', blogController.getComments);
router.get('/blog/categories', blogController.getCategories);
router.get('/blog/tags', blogController.getTags);

// Protected routes
router.post('/blog/posts', requireAuth, upload.single('image'), blogController.createPost);
router.put('/blog/posts/:id', requireAuth, blogController.updatePost);
router.delete('/blog/posts/:id', requireAuth, blogController.deletePost);

// Comment routes (require auth)
router.post('/blog/comments', requireAuth, blogController.addComment);
router.put('/blog/comments/:id', requireAuth, blogController.updateComment);
router.post('/blog/comments/:id', requireAuth, blogController.deleteComment);

// Like routes (optional auth - works with or without login)
router.post('/blog/posts/:id/like',  blogController.likePost);
router.post('/blog/comments/:id/like', blogController.likeComment);

// View tracking
router.post('/blog/posts/:id/view', blogController.incrementView);

// ========== UPCOMING ROUTES - Must come AFTER specific routes ==========
router.get('/by-month/:year/:month', upcoming.getTrekBymonth);
router.get('/meta/categories', upcoming.getTrekByCategory);
router.get('/stats/monthly/:year', upcoming.getTrekByYear);
router.get('/meta/available-years', upcoming.getAllyear);
router.get('/:id', upcoming.getTrekById);
router.get('/', upcoming.getAllUpcoming);


module.exports = router;
