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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function uploadToImgbb(file, apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('IMGBB_API_KEY kosong');

  const name = (file.name || 'cover.jpg').replace(/[^\w.\-]+/g, '_') || 'cover.jpg';
  const base64 = arrayBufferToBase64(await file.arrayBuffer());

  // ImgBB docs: key di query string, image sebagai base64 di body (POST)
  const url = 'https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key);
  const body = new URLSearchParams();
  body.set('image', base64);
  body.set('name', name);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!data.success) {
    const msg = data.error?.message || data.status_txt || ('ImgBB HTTP ' + res.status);
    if (/forbidden/i.test(msg)) {
      throw new Error(
        'ImgBB menolak upload dari server. Coba buat API key baru di api.imgbb.com, ' +
        'atau pastikan akun ImgBB tidak dibatasi.'
      );
    }
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
        imgbb_configured: Boolean(String(env.IMGBB_API_KEY || '').trim()),
      });
    }

    return json({ success: false, error: 'Not found' }, 404);
  },
};
