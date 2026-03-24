const axios = require('axios');
const cheerio = require('cheerio');

// Recursively extract highest‑resolution image URLs from the JSON data
function extractHighestResolutionUrls(obj, urls = {}, postId = null) {
  if (!obj) return urls;
  if (typeof obj === 'object') {
    // Capture post ID if present
    if (obj.pk && typeof obj.pk === 'string') {
      postId = obj.pk;
    }
    // Check for image candidates and pick the largest one
    if (obj.image_versions2 && obj.image_versions2.candidates && obj.image_versions2.candidates.length) {
      const candidates = obj.image_versions2.candidates;
      const highest = candidates.reduce((max, c) => {
        const area = c.width * c.height;
        const maxArea = max.width * max.height;
        return area > maxArea ? c : max;
      }, candidates[0]);
      if (highest && highest.url && postId && !urls[postId]) {
        // Decode URL (some characters are escaped)
        const decodedUrl = decodeURIComponent(highest.url);
        urls[postId] = decodedUrl;
      }
    }
    // Recurse into objects
    for (const key in obj) {
      extractHighestResolutionUrls(obj[key], urls, postId);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractHighestResolutionUrls(item, urls, postId);
    }
  }
  return urls;
}

module.exports = async (req, res) => {
  // CORS handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Mobile headers to mimic a real device
  const headers = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-GB,en;q=0.9',
    'dpr': '1',
    'priority': 'u=0, i',
    'sec-ch-prefers-color-scheme': 'dark',
    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-model': '"Nexus 5"',
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua-platform-version': '"6.0"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    'viewport-width': '1000',
  };

  try {
    const url = `https://www.instagram.com/${username}/`;
    const response = await axios.get(url, { headers, timeout: 10000 });

    if (response.status !== 200) {
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    const $ = cheerio.load(response.data);
    let timelineData = null;

    // Find the script tag containing the timeline data
    $('script[type="application/json"]').each((i, elem) => {
      const content = $(elem).html();
      if (content && content.includes('polaris_timeline_connection') && content.includes('image_versions2')) {
        try {
          timelineData = JSON.parse(content);
          return false; // break the loop
        } catch (e) {}
      }
    });

    if (!timelineData) {
      return res.status(200).json({ success: false, message: 'No private posts found or account is public', images: {} });
    }

    const imageUrls = extractHighestResolutionUrls(timelineData);
    const total = Object.keys(imageUrls).length;

    if (total === 0) {
      return res.status(200).json({ success: false, message: 'No images found', images: {} });
    }

    return res.status(200).json({ success: true, total, images: imageUrls });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Scraping failed: ' + error.message });
  }
};
