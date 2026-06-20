const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function uploadToImgbb(file, apiKey) {
  const fd = new FormData();
  fd.append('key', apiKey);
  fd.append('image', file, file.name || 'cover.jpg');

  const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    const msg = data.error?.message || data.status_txt || ('ImgBB HTTP ' + res.status);
    throw new Error(msg);
  }

  return {
    url: data.data.display_url || data.data.url,
    delete_url: data.data.delete_url || null,
    id: data.data.id || null,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/upload-img' && request.method === 'POST') {
      const apiKey = env.IMGBB_API_KEY;
      if (!apiKey) {
        return json({ success: false, error: 'IMGBB_API_KEY belum dikonfigurasi di worker' }, 500);
      }

      try {
        const form = await request.formData();
        const image = form.get('image');
        if (!image || typeof image === 'string') {
          return json({ success: false, error: 'Field "image" wajib berupa file gambar' }, 400);
        }
        if (image.size > 5 * 1024 * 1024) {
          return json({ success: false, error: 'File terlalu besar (maks 5MB)' }, 400);
        }
        if (image.type && !image.type.startsWith('image/')) {
          return json({ success: false, error: 'Hanya file gambar yang diizinkan' }, 400);
        }

        const uploaded = await uploadToImgbb(image, apiKey);
        return json({ success: true, data: uploaded });
      } catch (e) {
        return json({ success: false, error: e.message || 'Upload gagal' }, 502);
      }
    }

    if (pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        imgbb_configured: Boolean(env.IMGBB_API_KEY),
      });
    }

    return json({ success: false, error: 'Not found' }, 404);
  },
};
