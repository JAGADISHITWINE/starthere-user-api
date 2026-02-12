const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const trek = require('../controllers/trek.controlller');
const booking = require('../controllers/booking.controller');
const upcoming = require('../controllers/upcoming.controller');
const blog = require('../controllers/blog.controller');
const uploadPost = require('../middleware/upload');

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

// ========== TREK ROUTES ==========
router.get('/getTrekById/:id', trek.getTrekById);

// ========== BOOKING ROUTES ==========
router.post('/booking', booking.createBookingController);
router.get('/getMyBookingsById/:id', booking.getMyBookingsById);
router.get('/bookings/:userId/:bookingId/receipt', booking.getReceiptById);
router.post('/bookings/:bookingId/cancel', booking.cancleBooking);

// ========== BLOG ROUTES (PUBLIC) - Must come BEFORE upcoming routes ==========
router.get('/blog/posts/featured', blog.getFeaturedPosts);
router.get('/blog/posts/category/:category', blog.getPostsByCategory);
router.get('/blog/posts/:idOrSlug', blog.getPublishedPostByIdOrSlug);
router.get('/blog/posts', blog.getPublishedPosts);
router.post('/blog/posts/:id/view', blog.incrementViewCount);

// ========== BLOG ADMIN ROUTES ==========
router.get('/postEditor/:id', blog.getPostById);
router.get('/postEditor', blog.getAllPosts);
router.post('/postEditor', uploadPost.single('image'), blog.createPost);
router.put('/postEditor/:id', uploadPost.single('image'), blog.updatePost);
router.delete('/postEditor/:id', blog.deletePost);
router.patch('/postEditor/:id/publish', blog.publishPost);

// ========== CATEGORIES ROUTE ==========
router.get('/categories', blog.getCategories);

// ========== UPCOMING ROUTES - Must come AFTER specific routes ==========
router.get('/upcoming/by-month/:year/:month', upcoming.getTrekBymonth);
router.get('/upcoming/meta/categories', upcoming.getTrekByCategory);
router.get('/upcoming/stats/monthly/:year', upcoming.getTrekByYear);
router.get('/upcoming/meta/available-years', upcoming.getAllyear);
router.get('/upcoming/:id', upcoming.getTrekById);
router.get('/upcoming', upcoming.getAllUpcoming);

module.exports = router;