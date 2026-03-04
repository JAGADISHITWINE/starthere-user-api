const db = require('../config/db');
const { encrypt } = require('../service/cryptoHelper');

function sendEncrypted(res, payload) {
  return res.status(200).json({
    success: true,
    data: encrypt(payload)
  });
}

function mapEnumToOptions(values = []) {
  return values.map((value) => ({ value, label: value }));
}

async function getDropdownByType(req, res) {
  const type = String(req.params.type || '').trim().toLowerCase();

  try {
    switch (type) {
      case 'gender':
      case 'genders': {
        return sendEncrypted(res, {
          type: 'gender',
          options: mapEnumToOptions(['Male', 'Female', 'Other'])
        });
      }

      case 'id-types':
      case 'id_type':
      case 'idtype': {
        return sendEncrypted(res, {
          type: 'id-types',
          options: [
            { value: 'Aadhar', label: 'Aadhar Card' },
            { value: 'PAN', label: 'PAN Card' },
            { value: 'Passport', label: 'Passport' },
            { value: 'Driving License', label: 'Driving License' },
            { value: 'Voter ID', label: 'Voter ID' }
          ]
        });
      }

      case 'trek-category':
      case 'trek-categories': {
        const [rows] = await db.query(
          `SELECT DISTINCT category
           FROM treks
           WHERE category IS NOT NULL
           ORDER BY category ASC`
        );

        const options = rows.map((row) => ({
          value: String(row.category),
          label: String(row.category)
        }));

        return sendEncrypted(res, {
          type: 'trek-category',
          options
        });
      }

      case 'trek-collection':
      case 'trek-collections': {
        return sendEncrypted(res, {
          type: 'trek-collections',
          options: [
            { value: 'all', label: 'All Styles' },
            { value: 'weekend', label: 'Weekend Escapes' },
            { value: 'beginner', label: 'Beginner Friendly' },
            { value: 'budget', label: 'Budget Picks' },
            { value: 'scenic', label: 'Scenic Routes' }
          ]
        });
      }

      case 'trek-difficulty':
      case 'difficulty':
      case 'trek-difficulties': {
        const [rows] = await db.query(
          `SELECT DISTINCT difficulty
           FROM treks
           WHERE difficulty IS NOT NULL
           ORDER BY difficulty ASC`
        );

        const options = rows.map((row) => ({
          value: String(row.difficulty).toLowerCase(),
          label: String(row.difficulty)
        }));

        return sendEncrypted(res, {
          type: 'trek-difficulty',
          options
        });
      }

      case 'trek-filters': {
        const [rows] = await db.query(
          `SELECT DISTINCT difficulty
           FROM treks
           WHERE difficulty IS NOT NULL
           ORDER BY difficulty ASC`
        );

        const difficultyOptions = rows.map((row) => ({
          value: String(row.difficulty).toLowerCase(),
          label: String(row.difficulty)
        }));

        return sendEncrypted(res, {
          type: 'trek-filters',
          options: [
            { value: 'all', label: 'All Treks' },
            ...difficultyOptions
          ]
        });
      }

      case 'blog-categories':
      case 'blog-category': {
        const [rows] = await db.query(
          `SELECT id, name, slug
           FROM categories
           ORDER BY name ASC`
        );

        const options = rows.map((row) => ({
          value: row.slug || String(row.name).toLowerCase().replace(/\s+/g, '-'),
          label: row.name,
          id: row.id
        }));

        return sendEncrypted(res, {
          type: 'blog-categories',
          options
        });
      }

      default:
        return res.status(404).json({
          success: false,
          message: `Unknown dropdown type: ${type}`
        });
    }
  } catch (error) {
    console.error('Dropdown meta error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown options'
    });
  }
}

module.exports = {
  getDropdownByType
};
