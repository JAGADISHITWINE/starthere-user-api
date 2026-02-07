// controllers/trekController.js
const db = require("../config/db");
const { encrypt } = require("../service/cryptoHelper");

/**
 * Get all upcoming treks with filters
 */
async function getAllUpcoming(req, res) {
  let conn;
  
  try {
    conn = await db.getConnection();
    const { year, month, category, sort, status } = req.query;

    // Validate inputs
    if (year && (isNaN(year) || year < 2000 || year > 2100)) {
      return res.status(400).json({
        success: false,
        message: "Invalid year parameter"
      });
    }

    if (month && (isNaN(month) || month < 1 || month > 12)) {
      return res.status(400).json({
        success: false,
        message: "Invalid month parameter (must be 1-12)"
      });
    }

    let query = `
      SELECT 
        t.id,
        t.name,
        t.location,
        t.difficulty,
        t.category,
        t.description,
        t.cover_image,
        t.created_at,
        COUNT(DISTINCT tb.id) as total_batches,
        COUNT(DISTINCT CASE WHEN tb.status = 'active' THEN tb.id END) as active_batches,
        MIN(tb.price) as min_price,
        MAX(tb.price) as max_price
      FROM treks t
      LEFT JOIN trek_batches tb ON t.id = tb.trek_id
        AND tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
    `;

    const conditions = [];
    const params = [];

    // ✅ Only show treks that have at least one valid batch
    conditions.push("tb.id IS NOT NULL");

    // Filter by category
    if (category) {
      conditions.push("t.category = ?");
      params.push(category);
    }

    // Filter by batch status
    if (status === "active") {
      conditions.push("tb.status = ?");
      params.push("active");
    }

    // Filter by year and month
    if (year && month) {
      const monthIndex = parseInt(month) - 1;
      const startDate = new Date(parseInt(year), monthIndex, 1);
      const endDate = new Date(parseInt(year), monthIndex + 1, 0);

      conditions.push("tb.start_date BETWEEN ? AND ?");
      params.push(startDate.toISOString().split("T")[0]);
      params.push(endDate.toISOString().split("T")[0]);
    } else if (year) {
      conditions.push("YEAR(tb.start_date) = ?");
      params.push(year);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY t.id";

    // Sorting with whitelist to prevent SQL injection
    const allowedSorts = ["price-low", "price-high", "popular", "newest"];
    const sortParam = allowedSorts.includes(sort) ? sort : "newest";

    switch (sortParam) {
      case "price-low":
        query += " ORDER BY min_price ASC";
        break;
      case "price-high":
        query += " ORDER BY min_price DESC";
        break;
      case "popular":
        query += " ORDER BY total_batches DESC";
        break;
      case "newest":
      default:
        query += " ORDER BY t.created_at DESC";
        break;
    }

    const [treks] = await conn.execute(query, params);

    // Get batches for each trek (only valid future batches)
    for (let trek of treks) {
      const batchQuery = `
        SELECT 
          tb.*,
          (tb.available_slots - tb.booked_slots) as remaining_slots,
          CASE 
            WHEN tb.status != 'active' THEN 'inactive'
            WHEN (tb.available_slots - tb.booked_slots) <= 0 THEN 'sold-out'
            WHEN (tb.available_slots - tb.booked_slots) <= 3 THEN 'last-seat'
            WHEN (tb.available_slots - tb.booked_slots) <= 10 THEN 'selling-fast'
            ELSE 'available'
          END as batch_status
        FROM trek_batches tb
        WHERE tb.trek_id = ?
          AND tb.start_date > CURDATE()  -- ✅ Only future batches
          AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
        ORDER BY tb.start_date ASC
      `;

      const [batches] = await conn.execute(batchQuery, [trek.id]);
      trek.batches = batches;
    }

    const response = {
      success: true,
      count: treks.length,
      treks: treks
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get treks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch treks",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get trek by ID
 */
async function getTrekById(req, res) {
  let conn;

  try {
    conn = await db.getConnection();
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid trek ID"
      });
    }

    // Get trek details
    const [treks] = await conn.execute(
      "SELECT * FROM treks WHERE id = ?",
      [id]
    );

    if (treks.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trek not found"
      });
    }

    const trek = treks[0];

    // Safely parse JSON fields
    try {
      trek.highlights = JSON.parse(trek.highlights || "[]");
      trek.things_to_carry = JSON.parse(trek.things_to_carry || "[]");
      trek.important_notes = JSON.parse(trek.important_notes || "[]");
      trek.gallery_images = JSON.parse(trek.gallery_images || "[]");
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      trek.highlights = [];
      trek.things_to_carry = [];
      trek.important_notes = [];
      trek.gallery_images = [];
    }

    // Get batches - ✅ Only future batches with available slots
    const [batches] = await conn.execute(
      `
      SELECT 
        tb.*,
        (tb.available_slots - tb.booked_slots) as remaining_slots,
        CASE 
          WHEN tb.status != 'active' THEN 'inactive'
          WHEN (tb.available_slots - tb.booked_slots) <= 0 THEN 'sold-out'
          WHEN (tb.available_slots - tb.booked_slots) <= 3 THEN 'last-seat'
          WHEN (tb.available_slots - tb.booked_slots) <= 10 THEN 'selling-fast'
          ELSE 'available'
        END as batch_status
      FROM trek_batches tb
      WHERE tb.trek_id = ?
        AND tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
      ORDER BY tb.start_date ASC
      `,
      [id]
    );

    // Parse batch JSON fields
    for (let batch of batches) {
      try {
        batch.inclusions = JSON.parse(batch.inclusions || "[]");
        batch.exclusions = JSON.parse(batch.exclusions || "[]");
        batch.itinerary_days = JSON.parse(batch.itinerary_days || "[]");
      } catch (parseError) {
        console.error("Batch JSON parse error:", parseError);
        batch.inclusions = [];
        batch.exclusions = [];
        batch.itinerary_days = [];
      }
    }

    trek.batches = batches;

    const response = {
      success: true,
      trek: trek
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get trek error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch trek details",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get treks by month
 */
async function getTrekBymonth(req, res) {
  let conn;

  try {
    conn = await db.getConnection();
    const { year, month } = req.params;

    // Validate inputs
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year parameter"
      });
    }

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month parameter (must be 1-12)"
      });
    }

    const monthIndex = monthNum - 1;
    const startDate = new Date(yearNum, monthIndex, 1);
    const endDate = new Date(yearNum, monthIndex + 1, 0);

    const [treks] = await conn.execute(
      `
      SELECT 
        t.*,
        tb.id as batch_id,
        tb.start_date,
        tb.end_date,
        tb.price,
        tb.available_slots,
        tb.booked_slots,
        tb.duration,
        tb.status,
        (tb.available_slots - tb.booked_slots) as remaining_slots,
        CASE 
          WHEN tb.status != 'active' THEN 'inactive'
          WHEN (tb.available_slots - tb.booked_slots) <= 0 THEN 'sold-out'
          WHEN (tb.available_slots - tb.booked_slots) <= 3 THEN 'last-seat'
          WHEN (tb.available_slots - tb.booked_slots) <= 10 THEN 'selling-fast'
          ELSE 'available'
        END as batch_status
      FROM treks t
      INNER JOIN trek_batches tb ON t.id = tb.trek_id
      WHERE tb.start_date BETWEEN ? AND ?
        AND tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
      ORDER BY tb.start_date ASC, t.name ASC
      `,
      [
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0]
      ]
    );

    const response = {
      success: true,
      count: treks.length,
      treks: treks
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get treks by month error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch treks",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get trek categories
 */
async function getTrekByCategory(req, res) {
  let conn;

  try {
    conn = await db.getConnection();

    // ✅ Only count treks that have at least one valid batch
    const [categories] = await conn.execute(`
      SELECT 
        t.category, 
        COUNT(DISTINCT t.id) as count
      FROM treks t
      INNER JOIN trek_batches tb ON t.id = tb.trek_id
      WHERE tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
      GROUP BY t.category
      ORDER BY t.category
    `);

    const response = {
      success: true,
      count: categories.length,
      categories: categories
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get categories error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get monthly statistics for a year
 */
async function getTrekByYear(req, res) {
  let conn;

  try {
    conn = await db.getConnection();
    const { year } = req.params;

    // Validate year
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year parameter"
      });
    }

    const [stats] = await conn.execute(
      `
      SELECT 
        MONTH(tb.start_date) as month,
        COUNT(DISTINCT t.id) as trek_count,
        COUNT(tb.id) as batch_count
      FROM treks t
      INNER JOIN trek_batches tb ON t.id = tb.trek_id
      WHERE YEAR(tb.start_date) = ?
        AND tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
      GROUP BY MONTH(tb.start_date)
      ORDER BY month
      `,
      [yearNum]
    );

    // Fill in missing months with 0
    const monthStats = Array(12)
      .fill(0)
      .map((_, index) => ({
        month: index + 1,
        trek_count: 0,
        batch_count: 0
      }));

    stats.forEach((stat) => {
      monthStats[stat.month - 1] = stat;
    });

    const response = {
      success: true,
      year: yearNum,
      months: monthStats
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get monthly stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get all available years
 */
async function getAllyear(req, res) {
  let conn;

  try {
    conn = await db.getConnection();

    // ✅ Only show years that have future batches with available slots
    const [years] = await conn.execute(`
      SELECT DISTINCT YEAR(tb.start_date) as year
      FROM trek_batches tb
      WHERE tb.start_date > CURDATE()  -- ✅ Only future batches
        AND (tb.available_slots - tb.booked_slots) > 0  -- ✅ Only available slots
        AND YEAR(tb.start_date) >= 2000
        AND YEAR(tb.start_date) <= 2100
      ORDER BY year ASC
    `);

    const yearList = years.map((row) => row.year);

    const response = {
      success: true,
      count: yearList.length,
      years: yearList
    };

    const encryptedResponse = encrypt(response);

    return res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (error) {
    console.error("Get available years error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch available years",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getAllUpcoming,
  getTrekById,
  getTrekBymonth,
  getTrekByCategory,
  getTrekByYear,
  getAllyear
};