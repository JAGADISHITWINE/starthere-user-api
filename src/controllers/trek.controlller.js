const db = require('../config/db');
const {encrypt} = require('../service/cryptoHelper')


async function getDashboardData(req, res) {
  const conn = await db.getConnection();

  try {
    const [rows] = await conn.query(`
      SELECT
        b.id,
        t.name,
        t.location,
        t.difficulty,
        b.status,
        DATE_FORMAT(b.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(b.end_date, '%Y-%m-%d') AS endDate,
        b.min_participants,
        b.max_participants,
        b.price,
        t.cover_image,
        (b.available_slots - b.booked_slots) AS availableSlots,
        b.duration,
        CASE 
          WHEN (b.available_slots - b.booked_slots) <= 0 THEN 'sold-out'
          WHEN (b.available_slots - b.booked_slots) <= 3 THEN 'last-seat'
          WHEN (b.available_slots - b.booked_slots) <= 10 THEN 'selling-fast'
          ELSE 'available'
        END AS slotStatus,
        (
          SELECT JSON_ARRAYAGG(hh.highlight)
          FROM (
            SELECT h.highlight
            FROM trek_highlights h
            WHERE h.trek_id = t.id
            ORDER BY h.id ASC
            LIMIT 3
          ) hh
        ) AS highlights
      FROM treks t
      LEFT JOIN trek_batches b
        ON b.id = (
          SELECT b2.id
          FROM trek_batches b2
          WHERE b2.trek_id = t.id
            AND b2.status = 'active'

          ORDER BY b2.start_date ASC
          LIMIT 1
        )
      WHERE b.id IS NOT NULL; 
    `);

    const encryptedResponse = encrypt(rows);

    res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    console.error(err);
    res.status(200).json({ success: false, message: 'Failed to fetch treks' });
  } finally {
    conn.release();
  }
}

async function getTrekById(req, res) {
  const batchId = req.params.id;  // ✅ Accepting batch_id
  const conn = await db.getConnection();

  try {
    // ✅ First, get the batch to find the trek_id
    const [[batch]] = await conn.query(
      `SELECT 
        id AS batchId, 
        trek_id AS trekId, 
        start_date AS startDate, 
        end_date AS endDate, 
        available_slots AS availableSlots, 
        booked_slots AS bookedSlots,
        (available_slots - booked_slots) AS remainingSlots,
        price, 
        min_age AS minAge, 
        max_age AS maxAge, 
        min_participants AS minParticipants, 
        max_participants AS maxParticipants, 
        duration, 
        status,
        CASE 
          WHEN status != 'active' THEN 'inactive'
          WHEN (available_slots - booked_slots) <= 0 THEN 'sold-out'
          WHEN (available_slots - booked_slots) <= 3 THEN 'last-seat'
          WHEN (available_slots - booked_slots) <= 10 THEN 'selling-fast'
          ELSE 'available'
        END AS slotStatus
      FROM trek_batches 
      WHERE id = ?`,
      [batchId]
    );

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    const trekId = batch.trekId;

    // Get basic trek info
    const [[trek]] = await conn.query("SELECT * FROM treks WHERE id = ?", [
      trekId,
    ]);

    if (!trek) {
      return res.status(404).json({
        success: false,
        message: 'Trek not found'
      });
    }

    // Get highlights
    const [highlights] = await conn.query(
      "SELECT highlight FROM trek_highlights WHERE trek_id = ?",
      [trekId],
    );
    trek.highlights = highlights.map((h) => h.highlight);

    // Get things to carry
    const [thingsToCarry] = await conn.query(
      "SELECT item FROM trek_things_to_carry WHERE trek_id = ? ORDER BY display_order",
      [trekId],
    );
    trek.thingsToCarry = thingsToCarry.map((t) => t.item);

    // Get important notes
    const [importantNotes] = await conn.query(
      "SELECT note FROM trek_important_notes WHERE trek_id = ? ORDER BY display_order",
      [trekId],
    );
    trek.importantNotes = importantNotes.map((n) => n.note);

    // Get gallery images
    const [images] = await conn.query(
      "SELECT image_url FROM trek_images WHERE trek_id = ?",
      [trekId],
    );
    trek.galleryImages = images.map((img) => img.image_url);

    // ✅ Get inclusions for this batch - USING batch.batchId to be safe
    const [inclusions] = await conn.query(
      "SELECT inclusion FROM batch_inclusions WHERE batch_id = ? ORDER BY id",
      [batch.batchId],
    );
    batch.inclusions = inclusions.map((i) => i.inclusion);

    // ✅ Get exclusions for this batch - USING batch.batchId to be safe
    const [exclusions] = await conn.query(
      "SELECT exclusion FROM batch_exclusions WHERE batch_id = ? ORDER BY id",
      [batch.batchId],
    );
    batch.exclusions = exclusions.map((e) => e.exclusion);
    
    // ✅ Get itinerary days for this batch
    const [days] = await conn.query(
      "SELECT id, day_number AS dayNumber, title FROM itinerary_days WHERE batch_id = ? ORDER BY day_number",
      [batch.batchId],
    );

    // For each day, get activities
    for (const day of days) {
      const [activities] = await conn.query(
        "SELECT activity_time AS activityTime, activity_text AS activityText FROM itinerary_activities WHERE day_id = ? ORDER BY activity_time",
        [day.id],
      );
      day.activities = activities;

      // Remove internal id from response
      delete day.id;
    }

    batch.itineraryDays = days;

    // ✅ Attach only this batch to trek
    trek.batch = batch;

    const encryptedResponse = encrypt(trek);

    // Send response
    res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    console.error('Error fetching trek by batch:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trek',
      error: err.message
    });
  } finally {
    conn.release();
  }
}

async function getAllTreks(req, res) {
  const conn = await db.getConnection();

  try {
    /* =======================
       1️⃣ Fetch all treks (summary)
    ======================= */
    const [treks] = await conn.query(`
      SELECT 
        t.id,
        t.name,
        t.location,
        t.category,
        t.difficulty,
        t.fitness_level,
        t.description,
        t.cover_image,
        MIN(b.duration) AS duration,
        MIN(b.start_date) AS earliest_start_date,
        MAX(b.end_date) AS latest_end_date,
        MIN(b.price) AS starting_price,
        MAX(b.price) AS max_price,
        SUM(b.available_slots) AS total_available_slots,
        SUM(b.booked_slots) AS total_booked_slots,
        SUM(b.available_slots - b.booked_slots) AS total_remaining_slots,
        COUNT(DISTINCT b.id) AS total_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) AS active_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'inactive' THEN b.id END) AS inactive_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END) AS cancelled_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) AS completed_batches,
        t.created_at,
        t.updated_at
      FROM treks t
      LEFT JOIN trek_batches b ON b.trek_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    /* =======================
       2️⃣ Fetch all batches
    ======================= */
    const [allBatches] = await conn.query(`
      SELECT 
        id,
        trek_id,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
        status,
        price,
        available_slots,
        booked_slots,
        duration,
        (available_slots - booked_slots) AS remainingSlots
      FROM trek_batches
      ORDER BY start_date ASC
    `);

    // Group batches by trek_id
    const batchMap = {};
    for (const batch of allBatches) {
      if (!batchMap[batch.trek_id]) {
        batchMap[batch.trek_id] = [];
      }
      batchMap[batch.trek_id].push(batch);
    }

    /* =======================
       3️⃣ Fetch highlight counts
    ======================= */
    const [highlights] = await conn.query(`
      SELECT trek_id, COUNT(*) AS highlight_count
      FROM trek_highlights
      GROUP BY trek_id
    `);

    const highlightMap = {};
    for (const h of highlights) {
      highlightMap[h.trek_id] = h.highlight_count;
    }

    /* =======================
       4️⃣ Attach everything
    ======================= */
    for (const trek of treks) {
      trek.batches = batchMap[trek.id] || [];
      trek.highlight_count = highlightMap[trek.id] || 0;

      trek.earliest_start_date = trek.earliest_start_date
        ? new Date(trek.earliest_start_date).toISOString().split("T")[0]
        : null;

      trek.latest_end_date = trek.latest_end_date
        ? new Date(trek.latest_end_date).toISOString().split("T")[0]
        : null;

      trek.has_batches = trek.batches.length > 0;
      trek.has_available_slots = trek.batches.some(
        b => b.status === "active" && b.remainingSlots > 0
      );
    }

    /* =======================
       5️⃣ Trek counts
    ======================= */
    const [[totalCount]] = await conn.query(`
      SELECT COUNT(*) AS total_trek_count FROM treks
    `);

    const [[activeCount]] = await conn.query(`
      SELECT COUNT(DISTINCT t.id) AS active_trek_count
      FROM treks t
      JOIN trek_batches b ON b.trek_id = t.id
      WHERE b.status = 'active'
        AND b.start_date >= CURDATE()
        AND (b.available_slots - b.booked_slots) > 0
    `);

    /* =======================
       6️⃣ Response
    ======================= */
    const response = {
      count: treks.length,
      totalTreks: totalCount.total_trek_count,
      activeTrekCount: activeCount.active_trek_count,
      result: treks
    };

    const encryptedResponse = encrypt(response);

    res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    console.error("Error fetching treks:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch treks",
      error: err.message
    });
  } finally {
    conn.release();
  }
}

module.exports = { getDashboardData, getTrekById , getAllTreks };
