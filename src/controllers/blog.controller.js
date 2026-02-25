const db = require("../config/db");

const { decrypt, encrypt } = require('../service/cryptoHelper'); // adjust path

function encryptedResponse(res, statusCode, payload) {
  const encrypted = encrypt(payload.data);
  return res.status(statusCode).json({ ...payload, data: encrypted });
}

// Get all posts with category and tags
async function getAllPosts(req, res) {
  try {
    const {
      category,
      limit = '10',
      offset = '0',
      search,
      status = 'published'
    } = req.query;

    // 🔒 Sanitize and clamp pagination values
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let query = `
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        CASE 
          WHEN p.author_type = 'admin' THEN a.name
          WHEN p.author_type = 'user' THEN u.full_name
          ELSE 'Unknown'
        END as author_name,
        CASE 
          WHEN p.author_type = 'admin' THEN NULL
          WHEN p.author_type = 'user' THEN u.avatar
          ELSE NULL
        END as author_avatar,
        CASE 
          WHEN p.author_type = 'admin' THEN 'Admin User'
          WHEN p.author_type = 'user' THEN u.bio
          ELSE ''
        END as author_bio
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN admins a 
        ON p.author_id = a.id 
        AND p.author_type = 'admin' 
        AND a.status = 'active'
      LEFT JOIN users u 
        ON p.author_id = u.id 
        AND p.author_type = 'user' 
        AND u.is_active = 1
      WHERE p.status = ?
    `;

    const params = [status];

    // 📂 Filter by category
    if (category) {
      query += ` AND c.slug = ?`;
      params.push(category);
    }

    // 🔍 Search filter
    if (search) {
      query += ` AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // 🚀 IMPORTANT FIX:
    // Inject LIMIT and OFFSET directly (safe because sanitized above)
    query += ` ORDER BY p.published_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [posts] = await db.execute(query, params);

    // 🏷 Fetch tags for each post
    for (let post of posts) {
      const [tags] = await db.execute(
        `
        SELECT t.id, t.name, t.slug
        FROM tags t
        INNER JOIN post_tags pt ON t.id = pt.tag_id
        WHERE pt.post_id = ?
        `,
        [post.id]
      );

      post.tags = tags.map(tag => tag.name);
      post.tag_objects = tags;

      // 👤 Generate avatar fallback
      if (!post.author_avatar) {
        post.author_avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          post.author_name || 'User'
        )}&size=100`;
      }
    }

    return encryptedResponse(res, 200, {
      success: true,
      data: posts,
      total: posts.length,
      pagination: { limit: limitNum, offset: offsetNum }
    });

  } catch (error) {
    console.error('Error fetching posts:', error);

    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message
    });
  }
}

// Get single post by ID with full details
async function getPostById(req, res) {
  try {
    const { id } = req.params;

    const [posts] = await db.execute(
      `SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        CASE 
          WHEN p.author_type = 'admin' THEN a.name
          WHEN p.author_type = 'user' THEN u.full_name
          ELSE 'Unknown'
        END as author_name,
        CASE 
          WHEN p.author_type = 'admin' THEN NULL
          WHEN p.author_type = 'user' THEN u.avatar
          ELSE NULL
        END as author_avatar,
        CASE 
          WHEN p.author_type = 'admin' THEN 'Admin User'
          WHEN p.author_type = 'user' THEN u.bio
          ELSE ''
        END as author_bio
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN admins a ON p.author_id = a.id AND p.author_type = 'admin'
      LEFT JOIN users u ON p.author_id = u.id AND p.author_type = 'user'
      WHERE p.id = ?`,
      [parseInt(id)]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const post = posts[0];

    // Get tags
    const [tags] = await db.execute(
      `SELECT t.id, t.name, t.slug 
       FROM tags t
       INNER JOIN post_tags pt ON t.id = pt.tag_id
       WHERE pt.post_id = ?`,
      [post.id]
    );

    const formattedPost = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      featured_image: post.featured_image,
      category: post.category_slug,
      category_name: post.category_name,
      category_id: post.category_id,
      tags: tags.map(t => t.name),
      tag_objects: tags,
      author_name: post.author_name,
      author_type: post.author_type,
      author_avatar: post.author_avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name || 'Admin')}&size=100`,
      author_bio: post.author_bio || '',
      published_at: post.published_at,
      views: post.views || 0,
      likes: post.likes || 0,
      status: post.status
    };

    return encryptedResponse(res, 200, {
      success: true,
      data: formattedPost
    });

  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message
    });
  }
}

// Get related posts by category
async function getRelatedPosts(req, res) {
  try {
    const { category_id, exclude_id, limit = '3' } = req.query;

    const limitNum = Math.max(1, Math.min(10, parseInt(limit) || 3));
    const categoryIdNum = parseInt(category_id);
    const excludeIdNum = parseInt(exclude_id);

    const query = `
      SELECT 
        p.id,
        p.title,
        p.slug,
        p.featured_image,
        p.views,
        p.likes,
        c.slug AS category_slug
      FROM posts p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.category_id = ?
      AND p.id != ?
      AND p.status = 'published'
      ORDER BY p.published_at DESC
      LIMIT ${limitNum}
    `;

    const [posts] = await db.execute(query, [
      categoryIdNum,
      excludeIdNum
    ]);

    if (!posts.length) {
      return res.json({ success: true, data: encrypt([]) });
    }

    const formattedPosts = posts.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      image: post.featured_image,
      category: post.category_slug,
      views: post.views || 0,
      likes: post.likes || 0
    }));

    return res.json({
      success: true,
      data: encrypt(formattedPosts)
    });

  } catch (error) {
    console.error('Error fetching related posts:', error);
    return res.status(500).json({ success: false, data: [] });
  }
}

// Get comments for a post
async function getComments(req, res) {
  try {
    const { id } = req.params;
    const postId = parseInt(id);

    // Get main comments
    const [comments] = await db.execute(
      `SELECT 
        c.*,
        (
          SELECT COUNT(*) 
          FROM comment_likes 
          WHERE comment_id = c.id
        ) AS likes
      FROM comments c
      WHERE c.post_id = ? 
        AND c.parent_id IS NULL
      ORDER BY c.created_at DESC`,
      [postId]
    );

    // Attach replies
    for (let comment of comments) {

      // Generate fallback avatar if missing
      if (!comment.author_avatar) {
        comment.author_avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author_name || 'User')}&size=100`;
      }

      const [replies] = await db.execute(
        `SELECT 
          c.*,
          (
            SELECT COUNT(*) 
            FROM comment_likes 
            WHERE comment_id = c.id
          ) AS likes
        FROM comments c
        WHERE c.parent_id = ?
        ORDER BY c.created_at ASC`,
        [comment.id]
      );

      for (let reply of replies) {
        if (!reply.author_avatar) {
          reply.author_avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(reply.author_name || 'User')}&size=100`;
        }
      }

      comment.replies = replies;
    }

    return res.json({
      success: true,
      data: encrypt(comments)
    });

  } catch (error) {
    console.error('Error fetching comments:', error);

    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
}

// Like a post
async function likePost(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const userType = req.user?.type || null;
    const ipAddress = req.ip;

    const postId = parseInt(id);

    // Check if already liked
    let checkQuery = 'SELECT * FROM post_likes WHERE post_id = ?';
    let checkParams = [postId];

    if (userId) {
      checkQuery += ' AND user_id = ? AND user_type = ?';
      checkParams.push(userId, userType);
    } else {
      checkQuery += ' AND ip_address = ?';
      checkParams.push(ipAddress);
    }

    const [existingLike] = await db.execute(checkQuery, checkParams);

    if (existingLike.length > 0) {
      // Unlike
      if (userId) {
        await db.execute(
          'DELETE FROM post_likes WHERE post_id = ? AND user_id = ? AND user_type = ?',
          [postId, userId, userType]
        );
      } else {
        await db.execute(
          'DELETE FROM post_likes WHERE post_id = ? AND ip_address = ?',
          [postId, ipAddress]
        );
      }

      // Decrement likes in posts table
      await db.execute(
        'UPDATE posts SET likes = GREATEST(0, likes - 1) WHERE id = ?',
        [postId]
      );
    } else {
      // Like
      await db.execute(
        'INSERT INTO post_likes (post_id, user_id, user_type, ip_address) VALUES (?, ?, ?, ?)',
        [postId, userId, userType, ipAddress]
      );

      // Increment likes in posts table
      await db.execute(
        'UPDATE posts SET likes = likes + 1 WHERE id = ?',
        [postId]
      );
    }

    // Get updated like count
    const [result] = await db.execute(
      'SELECT likes FROM posts WHERE id = ?',
      [postId]
    );

    return res.json({
      success: true,
      data: encrypt({ likes: result[0].likes, liked: existingLike.length === 0 })
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({
      success: false,
      message: 'Error liking post',
      error: error.message
    });
  }
}

// Like a comment
async function likeComment(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const userType = req.user?.type || null;
    const ipAddress = req.ip;

    const commentId = parseInt(id);

    let checkQuery = 'SELECT * FROM comment_likes WHERE comment_id = ?';
    let checkParams = [commentId];

    if (userId) {
      checkQuery += ' AND user_id = ? AND user_type = ?';
      checkParams.push(userId, userType);
    } else {
      checkQuery += ' AND ip_address = ?';
      checkParams.push(ipAddress);
    }

    const [existingLike] = await db.execute(checkQuery, checkParams);

    if (existingLike.length > 0) {
      if (userId) {
        await db.execute(
          'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ? AND user_type = ?',
          [commentId, userId, userType]
        );
      } else {
        await db.execute(
          'DELETE FROM comment_likes WHERE comment_id = ? AND ip_address = ?',
          [commentId, ipAddress]
        );
      }
    } else {
      await db.execute(
        'INSERT INTO comment_likes (comment_id, user_id, user_type, ip_address) VALUES (?, ?, ?, ?)',
        [commentId, userId, userType, ipAddress]
      );
    }

    const [result] = await db.execute(
      'SELECT COUNT(*) as likes FROM comment_likes WHERE comment_id = ?',
      [commentId]
    );

    return res.json({
      success: true,
      data: encrypt({ likes: result[0].likes, liked: existingLike.length === 0 })
    });
  } catch (error) {
    console.error('Error liking comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error liking comment',
      error: error.message
    });
  }
}

// Add a comment
async function addComment(req, res) {
  try {

    const decrypted = decrypt(req.body.encryptedPayload);
    const { post_id, content, parent_id } = decrypted;
    const userIdNum = Number(req.user?.id);


    if (!content || !post_id || !userIdNum) {
      return res.status(400).json({
        success: false,
        message: 'Post ID and content are required'
      });
    }

    const postIdNum = parseInt(post_id);
    const parentIdNum = parent_id ? parseInt(parent_id) : null;

    // Get user info
    const [users] = await db.execute(
      'SELECT full_name, avatar FROM users WHERE id = ?',
      [userIdNum]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const authorName = users[0].full_name;
    const authorAvatar =
      users[0].avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&size=100`;

    // Insert comment (NO author_type)
    const [result] = await db.execute(
      `INSERT INTO comments 
        (post_id, user_id, author_name, author_avatar, content, parent_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [postIdNum, userIdNum, authorName, authorAvatar, content, parentIdNum]
    );

    const newComment = {
      id: result.insertId,
      post_id: postIdNum,
      user_id: userIdNum,
      author_name: authorName,
      author_avatar: authorAvatar,
      content,
      parent_id: parentIdNum,
      likes: 0,
      created_at: new Date()
    };

    return res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        data: encrypt(newComment)
    });

  } catch (error) {
    console.error('Error adding comment:', error);

    res.status(500).json({
      success: false,
      message: 'Error adding comment',
      error: error.message
    });
  }
}

// Delete a comment
async function deleteComment(req, res) {
  try {
    const userId = Number(req.user?.id);
    const commentId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const [rows] = await db.execute(
      "SELECT * FROM comments WHERE id = ?",
      [commentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comment not found"
      });
    }

    const comment = rows[0];

    if (Number(comment.user_id) !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this comment"
      });
    }

    await db.execute(
      "DELETE FROM comments WHERE id = ?",
      [commentId]
    );
    return res.json({
      success: true,
      data: encrypt({ message: 'Comment deleted successfully' })
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

// Increment view count
async function incrementView(req, res) {
  try {
    const { id } = req.params;
    const postId = parseInt(id);

    await db.execute(
      'UPDATE posts SET views = views + 1 WHERE id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: 'View count updated'
    });
  } catch (error) {
    console.error('Error incrementing view:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing view',
      error: error.message
    });
  }
}

// Create a new post
async function createPost(req, res) {

  const decrypted = decrypt(req.body.encryptedPayload);
  try {
    const userId = Number(req.user?.id);
    const userType = req.user?.type || 'user';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const {
      title,
      slug,
      excerpt,
      content,
      category,
      tags,
      status = 'draft',
      publishDate,
      existingImageUrl
    } = decrypted
      ;

    // Image path from multer
    const featured_image = req.file
      ? `uploads/${req.file.filename}`
      : existingImageUrl || null;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const postSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Parse category to get category_id if needed
    const [catRows] = await db.execute('SELECT id FROM categories WHERE name = ?', [category]);
    const categoryId = catRows.length > 0 ? catRows[0].id : null;

    const parsedTags = tags ? JSON.parse(tags) : [];


    const [result] = await db.execute(
      `INSERT INTO posts 
      (title, slug, excerpt, content, category_id, author_id, author_type, featured_image, status, published_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        postSlug,
        excerpt || '',
        content,
        categoryId,
        userId,
        userType,
        featured_image,
        status,
        status === 'published' ? new Date(publishDate) : null
      ]
    );

    const postId = result.insertId;

    // Handle tags
    if (parsedTags.length > 0) {
      for (let tagName of parsedTags) {
        let [existingTag] = await db.execute('SELECT id FROM tags WHERE name = ?', [tagName]);
        let tagId;
        if (existingTag.length > 0) {
          tagId = existingTag[0].id;
        } else {
          const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const [newTag] = await db.execute('INSERT INTO tags (name, slug) VALUES (?, ?)', [tagName, tagSlug]);
          tagId = newTag.insertId;
        }
        await db.execute('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tagId]);
      }
    }

    const [newPost] = await db.execute(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM posts p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [postId]
    );

    return encryptedResponse(res, 201, {
      success: true,
      message: 'Post created successfully',
      data: newPost[0]
    });;

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ success: false, message: 'Error creating post', error: error.message });
  }
}

// Update a post
async function updatePost(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      excerpt,
      content,
      category_id,
      tags,
      featured_image,
      status
    } = req.body;

    const userId = req.user?.id;
    const userType = req.user?.type;
    const postId = parseInt(id);

    const [posts] = await db.execute(
      'SELECT * FROM posts WHERE id = ?',
      [postId]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const post = posts[0];

    // Check authorization
    const isOwner = Number(post.author_id) === Number(userId) && post.author_type === userType;
    const isAdmin = userType === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post'
      });
    }

    const categoryIdNum = category_id !== undefined ? (category_id ? parseInt(category_id) : null) : post.category_id;

    await db.execute(
      `UPDATE posts SET 
       title = ?, slug = ?, excerpt = ?, content = ?, 
       category_id = ?, featured_image = ?, status = ?,
       published_at = ?
       WHERE id = ?`,
      [
        title || post.title,
        slug || post.slug,
        excerpt !== undefined ? excerpt : post.excerpt,
        content || post.content,
        categoryIdNum,
        featured_image !== undefined ? featured_image : post.featured_image,
        status || post.status,
        (status === 'published' && !post.published_at) ? new Date() : post.published_at,
        postId
      ]
    );

    // Update tags
    if (tags && Array.isArray(tags)) {
      await db.execute('DELETE FROM post_tags WHERE post_id = ?', [postId]);

      for (let tagName of tags) {
        let [existingTag] = await db.execute(
          'SELECT id FROM tags WHERE name = ?',
          [tagName]
        );

        let tagId;
        if (existingTag.length > 0) {
          tagId = existingTag[0].id;
        } else {
          const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const [newTag] = await db.execute(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tagId = newTag.insertId;
        }

        await db.execute(
          'INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)',
          [postId, tagId]
        );
      }
    }

    const [updatedPost] = await db.execute(
      `SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?`,
      [postId]
    );

    res.json({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost[0]
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating post',
      error: error.message
    });
  }
}

// Delete a post
async function deletePost(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userType = req.user?.type;
    const postId = parseInt(id);

    const [posts] = await db.execute(
      'SELECT * FROM posts WHERE id = ?',
      [postId]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const post = posts[0];

    // Check authorization
    const isOwner = Number(post.author_id) === Number(userId) && post.author_type === userType;
    const isAdmin = userType === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }

    await db.execute('DELETE FROM posts WHERE id = ?', [postId]);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting post',
      error: error.message
    });
  }
}

// Get categories
async function getCategories(req, res) {
  try {
    const [categories] = await db.execute('SELECT * FROM categories ORDER BY name ASC');


    return encryptedResponse(res, 200, {
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
}

// Get all tags
async function getTags(req, res) {
  try {
    const [tags] = await db.execute('SELECT * FROM tags ORDER BY name ASC');

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tags',
      error: error.message
    });
  }
}

async function updateComment(req, res) {
  try {
    const commentId = req.params.id;
    const decrypted = decrypt(req.body.encryptedPayload);
    const { content } = decrypted;
    const userId = Number(req.user?.id);

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Content cannot be empty"
      });
    }

    // 🔎 Check if comment exists
    const [commentRows] = await db.query(
      "SELECT * FROM comments WHERE id = ?",
      [commentId]
    );

    if (commentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comment not found"
      });
    }

    const comment = commentRows[0];

    // 🔐 Check ownership
    if (Number(comment.user_id) !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this comment"
      });
    }

    // ✏️ Update comment
    await db.query(
      "UPDATE comments SET content = ?, updated_at = NOW() WHERE id = ?",
      [content.trim(), commentId]
    );

    return res.status(200).json({
      success: true,
      data: encrypt({ message: 'Comment updated successfully' })
    });

  } catch (error) {
    console.error("Update comment error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getRelatedPosts,
  getComments,
  addComment,
  deleteComment,
  likePost,
  likeComment,
  incrementView,
  getCategories,
  getTags,
  updateComment
};
