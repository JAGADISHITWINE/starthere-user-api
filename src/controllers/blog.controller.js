const pool = require("../config/db");
const { generateSlug, formatDateForMySQL } = require("../utils/helpers");
const { marked } = require('marked');



// ========== PUBLIC BLOG ROUTES ==========

// Get published posts only
async function getPublishedPosts(req, res) {
  try {
    const [posts] = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.status = 'published'
      GROUP BY p.id
      ORDER BY p.published_at DESC
    `);
    
    const formattedPosts = posts.map((post) => ({
        ...post,
        content: marked.parse(post.content),
        tags: post.tags ? post.tags.split(',') : []
    }));

    res.json(formattedPosts);
  } catch (error) {
    console.error("Error fetching published posts:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
}

// Get featured posts (posts with high views)
async function getFeaturedPosts(req, res) {
  try {
    const [posts] = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.status = 'published' AND p.views >= 2000
      GROUP BY p.id
      ORDER BY p.views DESC
      LIMIT 3
    `);

    if (!rows.length) {
        return res.status(404).json({ message: 'Post not found' });
    }

    const post = rows[0];

    post.content = marked.parse(post.content);
    post.tags = post.tags ? post.tags.split(',') : [];

    res.json(post);
  } catch (error) {
    console.error("Error fetching featured posts:", error);
    res.status(500).json({ error: "Failed to fetch featured posts" });
  }
}

// Get posts by category
async function getPostsByCategory(req, res) {
  try {
    const { category } = req.params;

    const [posts] = await pool.query(
      `
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.status = 'published' AND (c.slug = ? OR c.name = ?)
      GROUP BY p.id
      ORDER BY p.published_at DESC
    `,
      [category, category]
    );

    const postsWithTags = posts.map((post) => ({
      ...post,
      tags: post.tags ? post.tags.split(",") : [],
    }));

    res.json(postsWithTags);
  } catch (error) {
    console.error("Error fetching posts by category:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
}

// Get single published post by ID or slug
async function getPublishedPostByIdOrSlug(req, res) {
  try {
    const { idOrSlug } = req.params;
    const isNumeric = !isNaN(idOrSlug);

    let query;
    let params;

    if (isNumeric) {
      query = `
        SELECT 
          p.*,
          c.name as category,
          c.slug as category_slug
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ? AND p.status = 'published'
      `;
      params = [idOrSlug];
    } else {
      query = `
        SELECT 
          p.*,
          c.name as category,
          c.slug as category_slug
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.slug = ? AND p.status = 'published'
      `;
      params = [idOrSlug];
    }

    const [posts] = await pool.query(query, params);

    if (posts.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const postId = posts[0].id;

    // Get tags
    const [tags] = await pool.query(
      `
      SELECT t.name
      FROM tags t
      INNER JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `,
      [postId]
    );

    const post = {
      ...posts[0],
      tags: tags.map((t) => t.name),
    };

    res.json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
}

// Increment view count
async function incrementViewCount(req, res) {
  try {
    const { id } = req.params;

    await pool.query("UPDATE posts SET views = views + 1 WHERE id = ?", [id]);

    res.json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    res.status(500).json({ error: "Failed to update view count" });
  }
}

// ========== ADMIN ROUTES ==========

// Get all posts (for admin)
async function getAllPosts(req, res) {
  try {
    const [posts] = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    const postsWithTags = posts.map((post) => ({
      ...post,
      tags: post.tags ? post.tags.split(",") : [],
    }));

    res.json(postsWithTags);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
}

// Get single post by ID (for admin)
async function getPostById(req, res) {
  try {
    const { id } = req.params;

    const [posts] = await pool.query(
      `
      SELECT 
        p.*,
        c.name as category,
        c.id as category_id
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `,
      [id]
    );

    if (posts.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Get tags for this post
    const [tags] = await pool.query(
      `
      SELECT t.name
      FROM tags t
      INNER JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `,
      [id]
    );

    const post = {
      ...posts[0],
      tags: tags.map((t) => t.name),
    };

    res.json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
}

// Create new post
async function createPost(req, res) {
  const connection = await pool.getConnection();

  try {
    console.log("req.body:", req.body);
    console.log("req.file:", req.file);

    if (!req.body) {
      return res.status(400).json({ error: "Request body is empty" });
    }

    await connection.beginTransaction();

    const { title, excerpt, content, category, status, publishDate, author } =
      req.body;
    const tags = JSON.parse(req.body.tags || "[]");

    // Validate required fields
    if (!title || !excerpt || !content || !category) {
      await connection.rollback();
      return res.status(400).json({
        error: "Missing required fields",
        received: { title, excerpt, content, category, status, publishDate, author },
      });
    }

    // Generate slug
    const slug = generateSlug(title);

    // Get category_id
    const [categories] = await connection.query(
      "SELECT id FROM categories WHERE name = ?",
      [category]
    );

    if (categories.length === 0) {
      throw new Error("Invalid category");
    }

    const category_id = categories[0].id;
    const published_at =
      status === "published" ? formatDateForMySQL(publishDate) : null;

    // Handle image upload
    let featuredImage = null;
    if (req.file) {
      featuredImage = `${process.env.BASE_URL}/uploads/${req.file.filename}`;

      // Save to media table
      await connection.query(
        `
        INSERT INTO media (filename, original_name, mime_type, size, url, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `,
        [
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          featuredImage,
        ]
      );
    }

    // Insert post
    const [result] = await connection.query(
      `
      INSERT INTO posts 
      (title, slug, excerpt, content, category_id, author_id, featured_image, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
      [
        title,
        slug,
        excerpt,
        content,
        category_id,
        1,
        featuredImage,
        status,
        published_at,
      ]
    );

    const postId = result.insertId;

    // Handle tags
    if (tags && Array.isArray(tags)) {
      await saveTags(connection, postId, tags);
    }

    await connection.commit();

    res.status(201).json({
      message: "Post created successfully",
      postId: postId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating post:", error);
    res
      .status(500)
      .json({ error: "Failed to create post", details: error.message });
  } finally {
    connection.release();
  }
}

// Update post
async function updatePost(req, res) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if post exists
    const [existingPost] = await connection.query(
      "SELECT * FROM posts WHERE id = ?",
      [id]
    );
    if (existingPost.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const existing = existingPost[0];
    const { title, excerpt, content, category, status, publishDate, existingImageUrl } =
      req.body;

    const tags = JSON.parse(req.body.tags || "[]");

    // Use existing values if not provided
    const finalTitle = title || existing.title;
    const finalExcerpt = excerpt || existing.excerpt;
    const finalContent = content || existing.content;
    const finalStatus = status || existing.status;

    // Handle image
    let featuredImage = existing.featured_image;

    if (req.file) {
      // New image uploaded
      featuredImage = `uploads/${req.file.filename}`;

      // Save to media table
      await connection.query(
        `
        INSERT INTO media (filename, original_name, mime_type, size, url, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `,
        [
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          featuredImage,
        ]
      );
    } else if (existingImageUrl) {
      // Keep existing image
      featuredImage = existingImageUrl;
    } else if (!existingImageUrl && !req.file) {
      // Image was removed
      featuredImage = null;
    }

    // Generate slug if title is provided
    const slug = title ? generateSlug(finalTitle) : existing.slug;

    // Get category_id if category is provided
    let category_id = existing.category_id;
    if (category) {
      const [categories] = await connection.query(
        "SELECT id FROM categories WHERE name = ?",
        [category]
      );
      if (categories.length > 0) {
        category_id = categories[0].id;
      }
    }

    const published_at =
      finalStatus === "published" && publishDate
        ? formatDateForMySQL(publishDate)
        : existing.published_at;

    // Update post
    await connection.query(
      `
      UPDATE posts 
      SET title = ?, slug = ?, excerpt = ?, content = ?, category_id = ?, 
          featured_image = ?, status = ?, published_at = ?, updated_at = NOW()
      WHERE id = ?
    `,
      [
        finalTitle,
        slug,
        finalExcerpt,
        finalContent,
        category_id,
        featuredImage,
        finalStatus,
        published_at,
        id,
      ]
    );

    // Handle tags
    if (tags && Array.isArray(tags)) {
      // Delete existing tags
      await connection.query("DELETE FROM post_tags WHERE post_id = ?", [id]);
      // Add new tags
      await saveTags(connection, id, tags);
    }

    await connection.commit();

    res.json({
      message: "Post updated successfully",
      postId: id,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating post:", error);
    res
      .status(500)
      .json({ error: "Failed to update post", details: error.message });
  } finally {
    connection.release();
  }
}

// Delete post
async function deletePost(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.query("DELETE FROM posts WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
}

// Publish post
async function publishPost(req, res) {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE posts 
      SET status = 'published', 
          published_at = NOW(), 
          updated_at = NOW()
      WHERE id = ?
    `,
      [id]
    );

    res.json({ message: "Post published successfully" });
  } catch (error) {
    console.error("Error publishing post:", error);
    res.status(500).json({ error: "Failed to publish post" });
  }
}

// Get categories
async function getCategories(req, res) {
  try {
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY name"
    );
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
}

// ========== HELPER FUNCTIONS ==========

// Helper function to save tags
async function saveTags(connection, postId, tags) {
  for (const tagName of tags) {
    if (!tagName || tagName.trim() === "") continue;

    const slug = generateSlug(tagName);

    // Insert or get tag
    let tagId;
    const [existingTag] = await connection.query(
      "SELECT id FROM tags WHERE slug = ?",
      [slug]
    );

    if (existingTag.length > 0) {
      tagId = existingTag[0].id;
    } else {
      const [newTag] = await connection.query(
        "INSERT INTO tags (name, slug) VALUES (?, ?)",
        [tagName.trim(), slug]
      );
      tagId = newTag.insertId;
    }

    // Link tag to post
    await connection.query(
      "INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)",
      [postId, tagId]
    );
  }
}

// ========== EXPORTS ==========
module.exports = {
  getPublishedPosts,
  getFeaturedPosts,
  getPostsByCategory,
  getPublishedPostByIdOrSlug,
  incrementViewCount,
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  getCategories,
};