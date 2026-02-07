const db = require("../config/db");
const emailService = require("../service/emailService"); // Email service

async function createBooking(bookingData) {
  const conn = await db.getConnection();

  try {
    // Start transaction
    await conn.beginTransaction();

    // 1. Check for duplicate completed bookings
    const [existingBookings] = await conn.execute(
      `
      SELECT id, booking_reference, booking_status 
      FROM bookings 
      WHERE user_id = ? 
        AND trek_id = ? 
        AND batch_id = ?
        AND booking_status = 'completed'
    `,
      [bookingData.userId, bookingData.trekId, bookingData.batchId],
    );

    if (existingBookings.length > 0) {
      await conn.rollback();
      throw new Error("DUPLICATE_BOOKING");
    }

    // 2. Check if user has any pending/confirmed booking for same trek
    const [pendingBookings] = await conn.execute(
      `
      SELECT id, booking_reference, booking_status 
      FROM bookings 
      WHERE user_id = ? 
        AND trek_id = ? 
        AND batch_id = ?
        AND booking_status IN ('pending', 'confirmed')
    `,
      [bookingData.userId, bookingData.trekId, bookingData.batchId],
    );

    if (pendingBookings.length > 0) {
      await conn.rollback();
      throw new Error("EXISTING_BOOKING");
    }

    // 3. Generate unique booking reference
    const bookingReference = generateBookingReference(
      bookingData.trekId,
      bookingData.batchId,
      bookingData.startDate,
    );

    // 4. Calculate pricing
    const basePrice = parseFloat(bookingData.price) * bookingData.participants;
    const addonsTotal = bookingData.selectedAddOns
      .filter((addon) => addon.selected)
      .reduce((sum, addon) => sum + addon.price * bookingData.participants, 0);
    const subtotal = basePrice + addonsTotal;
    const taxAmount = subtotal * 0.05; // 5% tax
    const totalAmount = subtotal + taxAmount;

    // 5. Insert main booking record
    const bookingQuery = `
      INSERT INTO bookings (
        booking_reference,
        user_id,
        trek_id,
        batch_id,
        customer_name,
        customer_email,
        customer_phone,
        emergency_contact,
        special_requests,
        trek_name,
        start_date,
        end_date,
        participants,
        base_price,
        addons_total,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_status,
        amount_paid,
        balance_due,
        refund_amount,
        cancellation_fee,
        payment_deadline,
        booking_status,
        confirmation_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const paymentDeadline = new Date(bookingData.startDate);
    paymentDeadline.setDate(paymentDeadline.getDate() - 7); // 7 days before trek

    const startDate = new Date(bookingData.startDate);
    const endDate = new Date(bookingData.endDate);

    const mysqlStartDate = startDate
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const mysqlEndDate = endDate
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const [bookingResult] = await conn.execute(bookingQuery, [
      bookingReference,
      bookingData.userId,
      bookingData.trekId,
      bookingData.batchId,
      bookingData.personalInfo.name,
      bookingData.personalInfo.email,
      bookingData.personalInfo.phone,
      bookingData.personalInfo.emergencyContact,
      bookingData.personalInfo.specialRequests,
      bookingData.trekName,
      mysqlStartDate,
      mysqlEndDate,
      bookingData.participants,
      basePrice,
      addonsTotal,
      subtotal,
      taxAmount,
      0, // discount_amount
      totalAmount,
      "pending",
      0, // amount_paid
      totalAmount, // balance_due
      0,
      0,
      paymentDeadline,
      "pending",
      false, // confirmation_sent
    ]);

    const bookingId = bookingResult.insertId;

    // 6. Insert booking add-ons
    if (bookingData.selectedAddOns && bookingData.selectedAddOns.length > 0) {
      const addonQuery = `
        INSERT INTO booking_addons (
          booking_id,
          addon_id,
          addon_name,
          quantity,
          unit_price,
          total_price
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const addon of bookingData.selectedAddOns) {
        if (addon.selected) {
          const quantity = bookingData.participants;
          const totalPrice = addon.price * quantity;

          await conn.execute(addonQuery, [
            bookingId,
            addon.id,
            addon.name,
            quantity,
            addon.price,
            totalPrice,
          ]);
        }
      }
    }

    // 7. Update trek batch available slots
    const updateSlotsQuery = `
      UPDATE trek_batches 
      SET 
        available_slots = available_slots - ?,
        booked_slots = booked_slots + ?
      WHERE id = ? AND available_slots >= ?
    `;

    const [updateResult] = await conn.execute(updateSlotsQuery, [
      bookingData.participants,
      bookingData.participants,
      bookingData.batchId,
      bookingData.participants,
    ]);

    // Check if update was successful
    if (updateResult.affectedRows === 0) {
      throw new Error("INSUFFICIENT_SLOTS");
    }

    // 8. Commit transaction
    await conn.commit();

    // 9. Fetch complete booking details
    const [bookingDetails] = await conn.execute(
      `
      SELECT 
        b.*,
        GROUP_CONCAT(
          CONCAT(ba.addon_name, ' (', ba.quantity, 'x₹', ba.unit_price, ')')
          SEPARATOR ', '
        ) as addons_summary
      FROM bookings b
      LEFT JOIN booking_addons ba ON b.id = ba.booking_id
      WHERE b.id = ?
      GROUP BY b.id
    `,
      [bookingId],
    );

    const booking = bookingDetails[0];

    // 10. Send confirmation email (async, don't wait)
    emailService
      .sendBookingConfirmation(booking)
      .then(() => {
        // Update confirmation_sent flag
        conn.execute(
          "UPDATE bookings SET confirmation_sent = TRUE WHERE id = ?",
          [bookingId],
        );
      })
      .catch((err) => {
        console.error("Failed to send confirmation email:", err);
      });

    // 11. Notify admin via admin socket server about new booking
    try {
      const ioClient = require('socket.io-client');
      const adminSocket = ioClient('http://localhost:4001', { transports: ['websocket'], reconnection: false });

      adminSocket.on('connect', () => {
        adminSocket.emit('booking-created', {
          bookingId: bookingId,
          bookingReference: bookingReference,
          customerName: booking.customer_name || booking.personalInfo?.name || null,
          trekName: booking.trek_name || booking.trekName || null,
          createdAt: new Date()
        });
        adminSocket.disconnect();
      });

      adminSocket.on('connect_error', (err) => {
        console.error('Failed to connect to admin socket server for booking notification', err);
      });
    } catch (err) {
      console.error('Error notifying admin about new booking:', err);
    }

    return {
      success: true,
      message: "Booking created successfully. Confirmation email sent.",
      booking: booking,
      bookingId: bookingId,
      bookingReference: bookingReference,
    };
  } catch (error) {
    // Rollback transaction on error
    await conn.rollback();
    console.error("Booking creation error:", error);

    // Custom error messages
    if (error.message === "DUPLICATE_BOOKING") {
      throw new Error(
        "You have already completed this trek. Each trek can only be booked once.",
      );
    }
    if (error.message === "EXISTING_BOOKING") {
      throw new Error(
        "You already have a pending or confirmed booking for this trek.",
      );
    }
    if (error.message === "INSUFFICIENT_SLOTS") {
      throw new Error("Insufficient available slots or batch not found");
    }

    throw error;
  } finally {
    // Release connection
    conn.release();
  }
}

function generateBookingReference(trekId, batchId, startDate) {
  const date = new Date(startDate);
  const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRK${trekId}-B${batchId}-${dateStr}-${randomStr}`;
}

module.exports = {
  createBooking,
};
