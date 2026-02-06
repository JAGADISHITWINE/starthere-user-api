const createBooking = require("../models/booking");
const db = require("../config/db");
const { encrypt, decrypt } = require("../service/cryptoHelper");
const PDFDocument = require('pdfkit');
const path = require('path');
const emailService = require("../service/emailService"); // Email service

async function createBookingController(req, res) {
  try {
    const bookingData = decrypt(req.body.encryptedPayload);
    const result = await createBooking.createBooking(bookingData);
    const encryptedResponse = encrypt(result);

    return res.status(200).json({
      success: true,
      message: "Booking created successfully",
      data: encryptedResponse,
    });
  } catch (error) {
    console.error("Error creating booking:", error);

    return res.status(200).json({
      success: false,
      message: error.message || "Failed to create booking",
    });
  }
}

async function getMyBookingsById(req, res) {
  const conn = await db.getConnection();
  const userId = req.params.id;
  try {
    const [bookings] = await conn.execute(
      `
        SELECT 
          b.*,
          t.name as trek_name,
          t.location,
          t.cover_image,
          tb.start_date,
          tb.end_date,
          tb.duration,
          DATEDIFF(tb.start_date, NOW()) as days_until_trek
        FROM bookings b
        INNER JOIN trek_batches tb ON b.batch_id = tb.id
        INNER JOIN treks t ON tb.trek_id = t.id
        WHERE b.user_id = ?
        ORDER BY tb.start_date DESC
      `,
      [userId],
    );

    // Get add-ons for each booking
    for (let booking of bookings) {
      const [addons] = await conn.execute(
        `
          SELECT addon_name, quantity, unit_price, total_price
          FROM booking_addons
          WHERE booking_id = ?
        `,
        [booking.id],
      );

      booking.addons = addons;
      booking.can_cancel =
        booking.days_until_trek >= 7 &&
        (booking.booking_status === "pending" ||
          booking.booking_status === "confirmed");
    }

    conn.release();

    const response = {
      count: bookings.length,
      bookings: bookings,
    };

    const encryptedResponse = encrypt(response);

    return res.json({
      success: true,
      data: encryptedResponse,
    });
  } catch (error) {
    conn.release();
    console.error("Get user bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
}

async function getReceiptById(req, res) {
  let conn;
  
  try {
    conn = await db.getConnection();
    
    const userId = req.params.userId;
    const bookingId = req.params.bookingId;

    const [bookings] = await conn.execute(`
      SELECT 
        b.*,
        t.name as trek_name,
        t.location,
        tb.start_date,
        tb.end_date,
        tb.duration,
        u.full_name as user_name,
        u.email as user_email
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      INNER JOIN treks t ON tb.trek_id = t.id
      INNER JOIN users u ON b.user_id = u.id
      WHERE b.id = ? AND b.user_id = ?
    `, [bookingId, userId]);

    if (!bookings || bookings.length === 0) {
      if (conn) conn.release();
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Get add-ons
    const [addons] = await conn.execute(`
      SELECT * FROM booking_addons WHERE booking_id = ?
    `, [bookingId]);

    // Create PDF
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });

    const fileName = `Receipt_${booking.booking_reference || bookingId}.pdf`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function for drawing lines
    const drawLine = (y) => {
      doc.moveTo(50, y).lineTo(545, y).stroke();
    };


    // Add logo and header
    const logoPath = path.join(__dirname, '../assets/logo.png'); // Adjust path to your logo

    // Check if logo exists
    const fs = require('fs');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 80, height: 80 })
        .moveDown(2);
    }

    doc.fontSize(24)
      .fillColor('#2c3e50')
      .text('BOOKING RECEIPT', { align: 'center' });


    
    doc.moveDown(0.5);
    drawLine(doc.y);
    doc.moveDown();

    // Booking Reference (highlighted)
    doc.fontSize(12)
       .fillColor('#34495e')
       .text('Booking Reference: ', { continued: true })
       .fontSize(14)
       .fillColor('#e74c3c')
       .text(booking.booking_reference || 'N/A');
    
    doc.fontSize(10)
       .fillColor('#7f8c8d')
       .text(`Booking Date: ${new Date(booking.created_at).toLocaleDateString()}`, { align: 'right' });
    
    doc.moveDown(1.5);

    // Trek Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Trek/Tour Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const trekDetails = [
      ['Trek/Tour Name:', booking.trek_name || 'N/A'],
      ['Location:', booking.location || 'N/A'],
      ['Start Date:', booking.start_date ? new Date(booking.start_date).toLocaleDateString() : 'N/A'],
      ['End Date:', booking.end_date ? new Date(booking.end_date).toLocaleDateString() : 'N/A'],
      ['Duration:', booking.duration || 'N/A'],
      ['Participants:', booking.participants || 0]
    ];

    trekDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1);

    // Customer Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Customer Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const customerDetails = [
      ['Name:', booking.customer_name || 'N/A'],
      ['Email:', booking.customer_email || 'N/A'],
      ['Phone:', booking.customer_phone || 'N/A'],
      ['Emergency Contact:', booking.emergency_contact || 'N/A']
    ];

    customerDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1.5);

    // Payment Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Payment Summary', { underline: true });
    doc.moveDown(0.5);

    // Create a table-like structure
    const startY = doc.y;
    doc.fontSize(11).fillColor('#34495e');

    const paymentItems = [
      ['Base Price', `₹${booking.base_price || 0}`],
      ['Add-ons Total', `₹${booking.addons_total || 0}`],
      ['Tax (5%)', `₹${booking.tax_amount || 0}`]
    ];

    paymentItems.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { width: 400 });
      doc.text(value, 450, doc.y - 11, { width: 95, align: 'right' });
      doc.moveDown(0.5);
    });

    doc.moveDown(0.3);
    drawLine(doc.y);
    doc.moveDown(0.5);

    // Total Amount (highlighted)
    doc.fontSize(14)
       .fillColor('#2c3e50')
       .text('Total Amount', 50, doc.y, { width: 400, bold: true });
    doc.fillColor('#27ae60')
       .text(`₹${booking.total_amount || 0}`, 450, doc.y - 14, { width: 95, align: 'right' });
    
    doc.moveDown(1);

    // Payment Status
    doc.fontSize(11).fillColor('#34495e');
    doc.text('Amount Paid', 50, doc.y, { width: 400 });
    doc.fillColor('#2c3e50')
       .text(`₹${booking.amount_paid || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
    doc.moveDown(0.5);

    const balanceDue = booking.balance_due || 0;
    doc.fillColor('#34495e')
       .text('Balance Due', 50, doc.y, { width: 400 });
    doc.fillColor(balanceDue > 0 ? '#e74c3c' : '#27ae60')
       .text(`₹${balanceDue}`, 450, doc.y - 11, { width: 95, align: 'right' });

    doc.moveDown(1.5);

    // Status Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Status', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11);
    const bookingStatus = booking.booking_status ? booking.booking_status.toUpperCase() : 'N/A';
    const paymentStatus = booking.payment_status ? booking.payment_status.toUpperCase() : 'N/A';

    // Status with color coding
    const statusColor = bookingStatus === 'CONFIRMED' ? '#27ae60' : '#e74c3c';
    const paymentColor = paymentStatus === 'PAID' ? '#27ae60' : '#e74c3c';

    doc.fillColor('#34495e')
       .text('Booking Status: ', { continued: true })
       .fillColor(statusColor)
       .text(bookingStatus);
    
    doc.fillColor('#34495e')
       .text('Payment Status: ', { continued: true })
       .fillColor(paymentColor)
       .text(paymentStatus);

    // Add-ons Section (if any)
    if (addons && addons.length > 0) {
      doc.addPage();
      
      doc.fontSize(16)
         .fillColor('#2c3e50')
         .text('Add-ons', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#34495e');
      
      addons.forEach((addon, index) => {
        doc.text(`${index + 1}. ${addon.name || 'N/A'}`, 50, doc.y, { width: 400 });
        doc.fillColor('#2c3e50')
           .text(`₹${addon.price || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
        doc.moveDown(0.5);
      });
    }

    // Finalize PDF
    doc.end();

    if (conn) conn.release();

  } catch (error) {
    if (conn) conn.release();
    console.error('Download receipt error:', error);
    console.error('Error stack:', error.stack);
    
    // If headers not sent yet, send error response
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download receipt',
        error: error.message
      });
    }
  }
}

async function cancleBooking(req, res) {
  let conn;
  
  try {
    conn = await db.getConnection();
    
    const bookingId = req.params.bookingId;
    const { userId, reason, acceptedTerms } = req.body;

    // Validation
    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and User ID are required'
      });
    }

    if (!acceptedTerms) {
      return res.status(400).json({
        success: false,
        message: 'You must accept the cancellation terms'
      });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    await conn.beginTransaction();

    // Get booking details
    const [bookings] = await conn.execute(`
      SELECT 
        b.*,
        tb.start_date,
        tb.available_slots,
        tb.booked_slots,
        DATEDIFF(tb.start_date, NOW()) as days_until_trek
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      WHERE b.id = ? AND b.user_id = ?
    `, [bookingId, userId]);

    if (bookings.length === 0) {
      await conn.rollback();
      if (conn) conn.release();
      return res.status(200).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Check if can cancel
    if (booking.booking_status === 'cancelled') {
      await conn.rollback();
      if (conn) conn.release();
      return res.status(200).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    if (booking.days_until_trek < 7) {
      await conn.rollback();
      if (conn) conn.release();
      return res.status(200).json({
        success: false,
        message: 'Cannot cancel booking within 7 days of trek. No refund available.'
      });
    }

    // Calculate refund based on cancellation policy
    const totalAmount = parseFloat(booking.total_amount || 0);
    let refundAmount = 0;
    let refundPercentage = 0;

    if (booking.days_until_trek >= 30) {
      refundAmount = totalAmount;
      refundPercentage = 100;
    } else if (booking.days_until_trek >= 15) {
      refundAmount = totalAmount * 0.75;
      refundPercentage = 75;
    } else if (booking.days_until_trek >= 7) {
      refundAmount = totalAmount * 0.50;
      refundPercentage = 50;
    }

    const cancellationFee = totalAmount - refundAmount;

    // Update booking status
    await conn.execute(`
      UPDATE bookings 
      SET booking_status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = ?,
          refund_amount = ?,
          cancellation_fee = ?,
          payment_status = 'refunded'
      WHERE id = ?
    `, [
      reason.trim(),
      parseFloat(refundAmount.toFixed(2)),
      parseFloat(cancellationFee.toFixed(2)),
      bookingId
    ]);

    // Update trek batch slots
    const participants = parseInt(booking.participants || 0);
    await conn.execute(`
      UPDATE trek_batches
      SET available_slots = available_slots + ?,
          booked_slots = booked_slots - ?
      WHERE id = ?
    `, [participants, participants, booking.batch_id]);

    await conn.commit();
    if (conn) conn.release();

    // Prepare booking data for email
    const bookingDataForEmail = {
      ...booking,
      refund_amount: refundAmount,
      refund_percentage: refundPercentage,
      cancellation_fee: cancellationFee,
      cancellation_reason: reason.trim()
    };

    // Send cancellation email (async, don't wait)
    emailService.sendCancellationEmail(bookingDataForEmail)
      .then(() => {
        console.log('Cancellation email sent to:', booking.customer_email);
      })
      .catch((err) => {
        console.error('Failed to send cancellation email:', err);
      });

    return res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        bookingId: parseInt(bookingId),
        bookingReference: booking.booking_reference,
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        refundPercentage: refundPercentage,
        cancellationFee: parseFloat(cancellationFee.toFixed(2)),
        processingTime: '7-10 business days',
        refundMethod: booking.payment_method || 'Original payment method'
      }
    });

  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
        conn.release();
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    console.error('Cancel booking error:', error);
    return res.status(200).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
}



module.exports = { createBookingController, getMyBookingsById, getReceiptById ,cancleBooking};
