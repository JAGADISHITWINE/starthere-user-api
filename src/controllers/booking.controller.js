
const createBooking = require('../models/booking');
const { encrypt, decrypt } = require('../service/cryptoHelper')



async function createBookingController(req, res) {
  try {
    const bookingData = decrypt(req.body.encryptedPayload);
    const result = await createBooking.createBooking(bookingData);
    const encryptedResponse = encrypt(result);

    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: encryptedResponse
    });

  } catch (error) {
    console.error('Error creating booking:', error);

    return res.status(201).json({
      success: false,
      message: error.message || 'Failed to create booking'
    });
  }
}


module.exports = { createBookingController };