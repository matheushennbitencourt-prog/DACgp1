const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-vercel-id',
]);

function getTargetUrl(req) {
  const baseUrl = process.env.RENDER_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('RENDER_API_BASE_URL nao configurada.');
  }

  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const targetUrl = new URL(`${normalizedBaseUrl}/${pathSegments.join('/')}`);

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => targetUrl.searchParams.append(key, item));
      return;
    }

    if (typeof value === 'string') {
      targetUrl.searchParams.set(key, value);
    }
  });

  return targetUrl;
}

function getProxyHeaders(req) {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      return;
    }

    headers.set(key, value);
  });

  return headers;
}

function getRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (req.body == null) {
    return undefined;
  }

  return JSON.stringify(req.body);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  try {
    const response = await fetch(getTargetUrl(req), {
      method: req.method,
      headers: getProxyHeaders(req),
      body: getRequestBody(req),
      redirect: 'manual',
    });

    res.status(response.status);

    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const body = Buffer.from(await response.arrayBuffer());
    res.send(body);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Falha ao conectar com o backend remoto.',
    });
  }
}
