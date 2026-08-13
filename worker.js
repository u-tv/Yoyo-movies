/**
 * ============================================================
 * YOOYOO MOVIE API — ENTERPRISE CLOUDFLARE WORKER
 * ============================================================
 * Runtime : Cloudflare Workers
 * Version : 3.0.0
 *
 * Required Secret:
 *   TMDB_API_KEY
 *
 * Optional Variables:
 *   TMDB_BASE_URL
 *   CACHE_TTL
 *   TMDB_TIMEOUT
 *   DEFAULT_LANGUAGE
 *   DEFAULT_REGION
 *
 * Example:
 *   /api/trending
 *   /api/trending?type=movie&window=week
 *   /api/movie/popular?page=2
 *   /api/movie/now_playing?region=IN&page=1
 *   /api/movie/top_rated?page=1
 *   /api/movie/upcoming?page=1
 *   /api/movie/550
 *   /api/search?q=avatar&page=1
 *   /api/discover?genre=28&region=IN
 *   /api/genres
 *   /api/tmdb/movie/550
 * ============================================================
 */

const APP_NAME = 'YOOYOO MOVIE API';
const APP_VERSION = '3.0.0';

const DEFAULT_TMDB_BASE =
  'https://api.themoviedb.org/3';

const DEFAULT_CACHE_TTL = 3600;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_REGION = 'IN';

const MAX_SEARCH_LENGTH = 120;
const MAX_PAGE = 500;
const MAX_APPEND_ITEMS = 10;
const MAX_GENRES = 20;

/* ============================================================
   CLOUDFLARE WORKER ENTRY
   ============================================================ */

export default {
  async fetch(request, env, ctx) {
    return handleRequest(
      request,
      env,
      ctx
    );
  }
};

/* ============================================================
   MAIN REQUEST HANDLER
   ============================================================ */

async function handleRequest(
  request,
  env,
  ctx
) {
  const startedAt = Date.now();

  const requestId =
    createRequestId();

  const method =
    request.method.toUpperCase();

  const url =
    new URL(request.url);

  const path =
    normalizePath(url.pathname);

  const corsHeaders =
    createCorsHeaders();

  /*
   * ----------------------------------------------------------
   * CORS PREFLIGHT
   * ----------------------------------------------------------
   */

  if (method === 'OPTIONS') {
    return new Response(
      null,
      {
        status: 204,
        headers: corsHeaders
      }
    );
  }

  /*
   * ----------------------------------------------------------
   * METHOD SECURITY
   * ----------------------------------------------------------
   */

  if (
    ![
      'GET',
      'HEAD'
    ].includes(method)
  ) {
    return jsonResponse(
      {
        success: false,
        error: {
          code:
            'METHOD_NOT_ALLOWED',
          message:
            'Only GET and HEAD requests are supported.'
        },
        requestId,
        timestamp:
          new Date().toISOString()
      },
      corsHeaders,
      405,
      requestId,
      {
        Allow:
          'GET, HEAD, OPTIONS'
      },
      method
    );
  }

  /*
   * ----------------------------------------------------------
   * ENVIRONMENT CONFIGURATION
   * ----------------------------------------------------------
   */

  const config =
    getConfig(env);

  /*
   * ----------------------------------------------------------
   * TMDB KEY VALIDATION
   * ----------------------------------------------------------
   */

  if (!config.tmdbApiKey) {
    return jsonResponse(
      {
        success: false,
        error: {
          code:
            'TMDB_CONFIGURATION_ERROR',
          message:
            'TMDB_API_KEY is not configured in Cloudflare Worker environment.'
        },
        requestId
      },
      corsHeaders,
      500,
      requestId,
      {},
      method
    );
  }

  /*
   * ----------------------------------------------------------
   * ROUTER
   * ----------------------------------------------------------
   */

  try {

    /*
     * ========================================================
     * ROOT
     * ========================================================
     */

    if (
      path === '/' ||
      path === '/index.html'
    ) {
      return jsonResponse(
        {
          success: true,

          status:
            `${APP_NAME} is running`,

          name:
            APP_NAME,

          version:
            APP_VERSION,

          runtime:
            'Cloudflare Workers',

          environment:
            'production',

          requestId,

          endpoints: {
            health:
              'GET /health',

            trending:
              'GET /api/trending',

            popular:
              'GET /api/movie/popular?page=1',

            nowPlaying:
              'GET /api/movie/now_playing?page=1&region=IN',

            topRated:
              'GET /api/movie/top_rated?page=1',

            upcoming:
              'GET /api/movie/upcoming?page=1',

            movie:
              'GET /api/movie/{id}',

            search:
              'GET /api/search?q={query}&page=1',

            discover:
              'GET /api/discover?genre={id}&region=IN',

            genres:
              'GET /api/genres',

            genericTMDB:
              'GET /api/tmdb/{endpoint}?{params}'
          },

          capabilities: [
            'CORS',
            'Cloudflare Edge Cache',
            'Cache API',
            'TMDB Proxy',
            'Request Timeout',
            'Automatic Retry',
            'Exponential Backoff',
            'Pagination',
            'Language Support',
            'Region Support',
            'Request IDs',
            'Input Validation',
            'HEAD Requests',
            'OPTIONS Requests',
            'Structured Errors',
            'TMDB Error Normalization',
            'Search',
            'Discover',
            'Movie Details',
            'Genre API'
          ],

          timestamp:
            new Date().toISOString(),

          responseTimeMs:
            Date.now() -
            startedAt
        },
        corsHeaders,
        200,
        requestId,
        {
          'Cache-Control':
            'no-store'
        },
        method
      );
    }

    /*
     * ========================================================
     * HEALTH CHECK
     * ========================================================
     */

    if (
      path === '/health'
    ) {
      return jsonResponse(
        {
          success: true,

          status:
            'healthy',

          service:
            APP_NAME,

          version:
            APP_VERSION,

          runtime:
            'cloudflare-workers',

          tmdbConfigured:
            Boolean(
              config.tmdbApiKey
            ),

          timestamp:
            new Date().toISOString(),

          requestId,

          latencyMs:
            Date.now() -
            startedAt
        },
        corsHeaders,
        200,
        requestId,
        {
          'Cache-Control':
            'no-store'
        },
        method
      );
    }

    /*
     * ========================================================
     * GENERIC TMDB PROXY
     * ========================================================
     */

    if (
      path.startsWith(
        '/api/tmdb/'
      )
    ) {
      const tmdbPath =
        path
          .replace(
            '/api/tmdb/',
            ''
          )
          .replace(
            /^\/+|\/+$/g,
            ''
          );

      if (!tmdbPath) {
        return jsonResponse(
          {
            success: false,
            error: {
              code:
                'INVALID_TMDB_ENDPOINT',
              message:
                'TMDB endpoint is required.'
            },
            requestId
          },
          corsHeaders,
          400,
          requestId,
          {},
          method
        );
      }

      /*
       * Path traversal / invalid character protection.
       */

      if (
        tmdbPath.includes(
          '..'
        ) ||
        tmdbPath.includes(
          '\\'
        ) ||
        !/^[a-zA-Z0-9/_-]+$/.test(
          tmdbPath
        )
      ) {
        return jsonResponse(
          {
            success: false,
            error: {
              code:
                'INVALID_TMDB_ENDPOINT',
              message:
                'Invalid TMDB endpoint.'
            },
            requestId
          },
          corsHeaders,
          400,
          requestId,
          {},
          method
        );
      }

      const searchParams =
        buildSafeTMDBSearchParams(
          url.searchParams,
          config
        );

      const tmdbUrl =
        `${config.tmdbBaseUrl}/${tmdbPath}?${searchParams.toString()}`;

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'HIT'
        ),
        method
      );
    }

    /*
     * ========================================================
     * TRENDING
     * ========================================================
     */

    if (
      path ===
      '/api/trending'
    ) {
      const mediaType =
        normalizeMediaType(
          url.searchParams.get(
            'type'
          ) || 'all'
        );

      const timeWindow =
        normalizeTimeWindow(
          url.searchParams.get(
            'window'
          )
        );

      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          `/trending/${mediaType}/${timeWindow}`,
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            page
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * POPULAR MOVIES
     * ========================================================
     */

    if (
      path ===
      '/api/movie/popular'
    ) {
      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const region =
        normalizeRegion(
          url.searchParams.get(
            'region'
          ) ||
          config.region
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/movie/popular',
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            page,

            region
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * NOW PLAYING
     * ========================================================
     */

    if (
      path ===
      '/api/movie/now_playing'
    ) {
      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const region =
        normalizeRegion(
          url.searchParams.get(
            'region'
          ) ||
          config.region
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/movie/now_playing',
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            page,

            region
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * TOP RATED
     * ========================================================
     */

    if (
      path ===
      '/api/movie/top_rated'
    ) {
      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/movie/top_rated',
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            page
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * UPCOMING
     * ========================================================
     */

    if (
      path ===
      '/api/movie/upcoming'
    ) {
      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const region =
        normalizeRegion(
          url.searchParams.get(
            'region'
          ) ||
          config.region
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/movie/upcoming',
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            page,

            region
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * MOVIE DETAILS
     * ========================================================
     */

    const movieMatch =
      path.match(
        /^\/api\/movie\/(\d+)$/
      );

    if (movieMatch) {
      const movieId =
        movieMatch[1];

      if (
        !/^\d+$/.test(
          movieId
        )
      ) {
        return jsonResponse(
          {
            success: false,
            error: {
              code:
                'INVALID_MOVIE_ID',
              message:
                'Movie ID must contain digits only.'
            },
            requestId
          },
          corsHeaders,
          400,
          requestId,
          {},
          method
        );
      }

      const append =
        sanitizeAppendList(
          url.searchParams.get(
            'append'
          ) ||
          url.searchParams.get(
            'append_to_response'
          ) ||
          [
            'credits',
            'videos',
            'images',
            'recommendations',
            'similar'
          ].join(',')
        );

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          `/movie/${movieId}`,
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language,

            append_to_response:
              append
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * SEARCH
     * ========================================================
     */

    if (
      path ===
      '/api/search'
    ) {
      const query =
        (
          url.searchParams.get(
            'q'
          ) || ''
        ).trim();

      if (!query) {
        return jsonResponse(
          {
            success: false,
            error: {
              code:
                'MISSING_QUERY',
              message:
                'Query parameter q is required.'
            },
            requestId
          },
          corsHeaders,
          400,
          requestId,
          {},
          method
        );
      }

      if (
        query.length >
        MAX_SEARCH_LENGTH
      ) {
        return jsonResponse(
          {
            success: false,
            error: {
              code:
                'QUERY_TOO_LONG',
              message:
                `Search query must not exceed ${MAX_SEARCH_LENGTH} characters.`
            },
            requestId
          },
          corsHeaders,
          400,
          requestId,
          {},
          method
        );
      }

      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const includeAdult =
        url.searchParams.get(
          'include_adult'
        ) === 'true';

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/search/multi',
          {
            api_key:
              config.tmdbApiKey,

            query,

            language:
              config.language,

            page,

            include_adult:
              String(
                includeAdult
              )
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              Math.min(
                config.cacheTTL,
                300
              )
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          Math.min(
            config.cacheTTL,
            300
          ),
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * DISCOVER
     * ========================================================
     */

    if (
      path ===
      '/api/discover'
    ) {
      const genre =
        url.searchParams.get(
          'genre'
        ) || '';

      const region =
        normalizeRegion(
          url.searchParams.get(
            'region'
          ) ||
          config.region
        );

      const page =
        normalizePage(
          url.searchParams.get(
            'page'
          )
        );

      const year =
        url.searchParams.get(
          'year'
        );

      const sortBy =
        normalizeSort(
          url.searchParams.get(
            'sort_by'
          )
        );

      const params = {
        api_key:
          config.tmdbApiKey,

        language:
          config.language,

        sort_by:
          sortBy,

        page,

        region
      };

      /*
       * Genre validation.
       */

      if (genre) {
        const safeGenres =
          sanitizeNumericList(
            genre
          );

        if (safeGenres) {
          params.with_genres =
            safeGenres;
        }
      }

      /*
       * Release year.
       */

      if (
        year &&
        /^\d{4}$/.test(
          year
        )
      ) {
        const numericYear =
          Number(year);

        if (
          numericYear >= 1870 &&
          numericYear <=
            new Date()
              .getUTCFullYear() + 10
        ) {
          params.primary_release_year =
            String(
              numericYear
            );
        }
      }

      /*
       * Original language.
       */

      const originalLanguage =
        url.searchParams.get(
          'language_original'
        );

      if (
        originalLanguage &&
        /^[a-zA-Z]{2,3}$/.test(
          originalLanguage
        )
      ) {
        params.with_original_language =
          originalLanguage
            .toLowerCase();
      }

      /*
       * Minimum vote average.
       */

      const minRating =
        url.searchParams.get(
          'vote_average'
        );

      if (
        minRating &&
        /^\d+(\.\d+)?$/.test(
          minRating
        )
      ) {
        params[
          'vote_average.gte'
        ] =
          String(
            Math.min(
              Number(
                minRating
              ),
              10
            )
          );
      }

      /*
       * Maximum vote average.
       */

      const maxRating =
        url.searchParams.get(
          'vote_average_max'
        );

      if (
        maxRating &&
        /^\d+(\.\d+)?$/.test(
          maxRating
        )
      ) {
        params[
          'vote_average.lte'
        ] =
          String(
            Math.min(
              Number(
                maxRating
              ),
              10
            )
          );
      }

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          '/discover/movie',
          params
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              config.cacheTTL
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          config.cacheTTL,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * GENRES
     * ========================================================
     */

    if (
      path ===
      '/api/genres'
    ) {
      const type =
        url.searchParams.get(
          'type'
        ) === 'tv'
          ? 'tv'
          : 'movie';

      const tmdbUrl =
        buildTMDBUrl(
          config.tmdbBaseUrl,
          `/genre/${type}/list`,
          {
            api_key:
              config.tmdbApiKey,

            language:
              config.language
          }
        );

      const data =
        await fetchTMDBAdvanced(
          tmdbUrl,
          {
            timeout:
              config.timeout,

            cacheTTL:
              86400
          }
        );

      return jsonResponse(
        data,
        corsHeaders,
        200,
        requestId,
        createCacheHeaders(
          86400,
          'MISS'
        ),
        method
      );
    }

    /*
     * ========================================================
     * NOT FOUND
     * ========================================================
     */

    return jsonResponse(
      {
        success: false,

        error: {
          code:
            'NOT_FOUND',

          message:
            'Requested API endpoint does not exist.'
        },

        path,

        availableEndpoints: [
          'GET /',
          'GET /health',
          'GET /api/trending',
          'GET /api/movie/popular',
          'GET /api/movie/now_playing',
          'GET /api/movie/top_rated',
          'GET /api/movie/upcoming',
          'GET /api/movie/{id}',
          'GET /api/search?q=',
          'GET /api/discover',
          'GET /api/genres',
          'GET /api/tmdb/{endpoint}'
        ],

        requestId,

        timestamp:
          new Date().toISOString()
      },
      corsHeaders,
      404,
      requestId,
      {},
      method
    );

  } catch (error) {

    /*
     * --------------------------------------------------------
     * GLOBAL ERROR HANDLER
     * --------------------------------------------------------
     */

    console.error(
      JSON.stringify({
        requestId,
        path,
        method,

        error:
          error?.message ||
          String(error),

        status:
          error?.status ||
          null,

        stack:
          error?.stack ||
          null,

        timestamp:
          new Date().toISOString()
      })
    );

    const status =
      Number(error?.status) >= 400 &&
      Number(error?.status) < 600
        ? Number(error.status)
        : 500;

    let errorCode =
      'INTERNAL_SERVER_ERROR';

    let errorMessage =
      'Internal Server Error.';

    if (
      status === 429
    ) {
      errorCode =
        'TMDB_RATE_LIMIT';

      errorMessage =
        'TMDB rate limit reached. Please retry later.';
    } else if (
      status >= 500
    ) {
      errorCode =
        'UPSTREAM_ERROR';

      errorMessage =
        'Upstream TMDB service is temporarily unavailable.';
    } else if (
      status === 408
    ) {
      errorCode =
        'UPSTREAM_TIMEOUT';

      errorMessage =
        'TMDB request timed out.';
    } else if (
      error?.message
    ) {
      errorCode =
        'REQUEST_ERROR';

      errorMessage =
        error.message;
    }

    return jsonResponse(
      {
        success: false,

        error: {
          code:
            errorCode,

          message:
            errorMessage
        },

        requestId,

        timestamp:
          new Date().toISOString(),

        latencyMs:
          Date.now() -
          startedAt
      },
      corsHeaders,
      status,
      requestId,
      {},
      method
    );
  }
}

/* ============================================================
   CONFIGURATION
   ============================================================ */

function getConfig(env) {
  const tmdbApiKey =
    env?.TMDB_API_KEY ||
    '';

  const tmdbBaseUrl =
    String(
      env?.TMDB_BASE_URL ||
      DEFAULT_TMDB_BASE
    )
      .trim()
      .replace(
        /\/+$/,
        ''
      );

  const cacheTTL =
    normalizePositiveInteger(
      env?.CACHE_TTL,
      DEFAULT_CACHE_TTL,
      60,
      86400
    );

  const timeout =
    normalizePositiveInteger(
      env?.TMDB_TIMEOUT,
      DEFAULT_TIMEOUT,
      1000,
      30000
    );

  const language =
    normalizeLanguage(
      env?.DEFAULT_LANGUAGE ||
      DEFAULT_LANGUAGE
    );

  const region =
    normalizeRegion(
      env?.DEFAULT_REGION ||
      DEFAULT_REGION
    );

  return {
    tmdbApiKey,

    tmdbBaseUrl,

    cacheTTL,

    timeout,

    language,

    region
  };
}

/* ============================================================
   CORS
   ============================================================ */

function createCorsHeaders() {
  return {
    'Access-Control-Allow-Origin':
      '*',

    'Access-Control-Allow-Methods':
      'GET, HEAD, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With',

    'Access-Control-Max-Age':
      '86400',

    'Access-Control-Expose-Headers':
      [
        'X-Request-ID',
        'X-Response-Time',
        'X-Cache',
        'X-Worker-Version'
      ].join(', '),

    'Content-Type':
      'application/json; charset=UTF-8',

    'X-Content-Type-Options':
      'nosniff',

    'Referrer-Policy':
      'strict-origin-when-cross-origin'
  };
}

/* ============================================================
   GENERIC SAFE TMDB QUERY PARAMETER BUILDER
   ============================================================ */

function buildSafeTMDBSearchParams(
  incoming,
  config
) {
  const output =
    new URLSearchParams();

  const allowed =
    [
      'language',
      'region',
      'page',
      'query',
      'append_to_response',
      'with_genres',
      'sort_by',
      'include_adult',
      'include_video',
      'year',
      'primary_release_year',
      'with_original_language',
      'vote_average.gte',
      'vote_average.lte',
      'vote_count.gte',
      'vote_count.lte',
      'with_runtime.gte',
      'with_runtime.lte',
      'with_cast',
      'with_crew',
      'with_people',
      'with_companies',
      'with_keywords',
      'without_genres',
      'without_keywords',
      'release_date.gte',
      'release_date.lte'
    ];

  for (
    const key of allowed
  ) {
    const value =
      incoming.get(key);

    if (
      value !== null &&
      value !== ''
    ) {
      output.set(
        key,
        value
      );
    }
  }

  /*
   * Never trust caller supplied API key.
   */

  output.set(
    'api_key',
    config.tmdbApiKey
  );

  /*
   * Always enforce a valid language.
   */

  output.set(
    'language',
    normalizeLanguage(
      incoming.get(
        'language'
      ) ||
      config.language
    )
  );

  /*
   * Normalize page.
   */

  if (
    incoming.has('page')
  ) {
    output.set(
      'page',
      normalizePage(
        incoming.get(
          'page'
        )
      )
    );
  }

  /*
   * Normalize region.
   */

  if (
    incoming.has('region')
  ) {
    output.set(
      'region',
      normalizeRegion(
        incoming.get(
          'region'
        )
      )
    );
  }

  return output;
}

/* ============================================================
   TMDB URL BUILDER
   ============================================================ */

function buildTMDBUrl(
  baseUrl,
  pathname,
  params = {}
) {
  const query =
    new URLSearchParams();

  for (
    const [
      key,
      value
    ] of Object.entries(
      params
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      query.set(
        key,
        String(value)
      );
    }
  }

  return (
    `${baseUrl}${pathname}?${query.toString()}`
  );
}

/* ============================================================
   ADVANCED TMDB FETCH ENGINE
   ============================================================ */

async function fetchTMDBAdvanced(
  targetUrl,
  options = {}
) {
  const timeout =
    Number(
      options.timeout ||
      DEFAULT_TIMEOUT
    );

  const cacheTTL =
    Number(
      options.cacheTTL ||
      DEFAULT_CACHE_TTL
    );

  const cache =
    caches.default;

  /*
   * Cache key.
   */

  const cacheKey =
    new Request(
      targetUrl,
      {
        method:
          'GET'
      }
    );

  /*
   * ----------------------------------------------------------
   * EDGE CACHE LOOKUP
   * ----------------------------------------------------------
   */

  try {
    const cached =
      await cache.match(
        cacheKey
      );

    if (cached) {
      const cachedText =
        await cached.text();

      try {
        return JSON.parse(
          cachedText
        );
      } catch {
        /*
         * Invalid cache entry:
         * continue to upstream.
         */
      }
    }
  } catch (cacheReadError) {
    console.warn(
      'Cache read failed:',
      cacheReadError
    );
  }

  /*
   * ----------------------------------------------------------
   * RETRY ENGINE
   * ----------------------------------------------------------
   */

  let response =
    null;

  let lastError =
    null;

  const maxAttempts =
    3;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {

      response =
        await fetchWithTimeout(
          targetUrl,
          {
            method:
              'GET',

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                `${APP_NAME}/${APP_VERSION}`
            },

            cf: {
              cacheTtl:
                cacheTTL,

              cacheEverything:
                true
            }
          },
          timeout
        );

      /*
       * Success OR non-retryable response.
       */

      if (
        response.ok ||
        !isRetryableStatus(
          response.status
        )
      ) {
        break;
      }

      lastError =
        createHttpError(
          response.status,
          `TMDB HTTP ${response.status}`
        );

    } catch (error) {

      lastError =
        error;

      /*
       * Timeout/network failure.
       */

      if (
        attempt ===
        maxAttempts
      ) {
        throw error;
      }
    }

    /*
     * Exponential backoff:
     *
     * Attempt 1 → 250ms
     * Attempt 2 → 500ms
     * Attempt 3 → 1000ms
     */

    await sleep(
      250 *
      Math.pow(
        2,
        attempt - 1
      )
    );
  }

  /*
   * No response.
   */

  if (!response) {
    throw (
      lastError ||
      new Error(
        'TMDB returned no response.'
      )
    );
  }

  /*
   * ----------------------------------------------------------
   * READ RESPONSE
   * ----------------------------------------------------------
   */

  const rawText =
    await response.text();

  let data =
    {};

  try {
    data =
      rawText
        ? JSON.parse(
            rawText
          )
        : {};
  } catch {
    const parseError =
      new Error(
        'TMDB returned invalid JSON.'
      );

    parseError.status =
      502;

    throw parseError;
  }

  /*
   * ----------------------------------------------------------
   * TMDB ERROR NORMALIZATION
   * ----------------------------------------------------------
   */

  if (!response.ok) {

    const error =
      new Error(
        data?.status_message ||
        `TMDB request failed with HTTP ${response.status}.`
      );

    error.status =
      response.status;

    error.tmdb =
      data;

    throw error;
  }

  /*
   * ----------------------------------------------------------
   * EDGE CACHE WRITE
   * ----------------------------------------------------------
   */

  const cacheResponse =
    new Response(
      JSON.stringify(
        data
      ),
      {
        status:
          200,

        headers: {
          'Content-Type':
            'application/json; charset=UTF-8',

          'Cache-Control':
            `public, max-age=${cacheTTL}`
        }
      }
    );

  try {
    await cache.put(
      cacheKey,
      cacheResponse
    );
  } catch (cacheWriteError) {
    console.warn(
      'Cache write failed:',
      cacheWriteError
    );
  }

  return data;
}

/* ============================================================
   FETCH WITH TIMEOUT
   ============================================================ */

async function fetchWithTimeout(
  target,
  options,
  timeout
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout
    );

  try {

    return await fetch(
      target,
      {
        ...options,

        signal:
          controller.signal
      }
    );

  } catch (error) {

    if (
      error?.name ===
      'AbortError'
    ) {
      const timeoutError =
        new Error(
          `TMDB request timed out after ${timeout}ms.`
        );

      timeoutError.status =
        408;

      timeoutError.code =
        'UPSTREAM_TIMEOUT';

      throw timeoutError;
    }

    throw error;

  } finally {

    clearTimeout(
      timer
    );
  }
}

/* ============================================================
   RESPONSE BUILDER
   ============================================================ */

function jsonResponse(
  data,
  baseHeaders,
  status = 200,
  requestId = '',
  extraHeaders = {},
  method = 'GET'
) {
  const headers =
    new Headers(
      baseHeaders
    );

  headers.set(
    'Content-Type',
    'application/json; charset=UTF-8'
  );

  headers.set(
    'X-Worker-Version',
    APP_VERSION
  );

  if (requestId) {
    headers.set(
      'X-Request-ID',
      requestId
    );
  }

  /*
   * Approximate response timing.
   */

  headers.set(
    'X-Response-Time',
    `${Date.now()}ms`
  );

  headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  /*
   * Additional headers.
   */

  for (
    const [
      key,
      value
    ] of Object.entries(
      extraHeaders
    )
  ) {
    headers.set(
      key,
      String(value)
    );
  }

  /*
   * HEAD must not return a body.
   */

  if (
    method === 'HEAD'
  ) {
    return new Response(
      null,
      {
        status,
        headers
      }
    );
  }

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers
    }
  );
}

/* ============================================================
   CACHE HEADERS
   ============================================================ */

function createCacheHeaders(
  ttl,
  cacheStatus = 'MISS'
) {
  return {
    'Cache-Control':
      `public, max-age=${ttl}, s-maxage=${ttl}`,

    'CDN-Cache-Control':
      `public, max-age=${ttl}`,

    'X-Cache':
      cacheStatus
  };
}

/* ============================================================
   PAGE NORMALIZER
   ============================================================ */

function normalizePage(
  value
) {
  const page =
    Number.parseInt(
      value || '1',
      10
    );

  if (
    !Number.isFinite(
      page
    ) ||
    page < 1
  ) {
    return '1';
  }

  return String(
    Math.min(
      page,
      MAX_PAGE
    )
  );
}

/* ============================================================
   LANGUAGE NORMALIZER
   ============================================================ */

function normalizeLanguage(
  value
) {
  const language =
    String(
      value ||
      DEFAULT_LANGUAGE
    ).trim();

  if (
    !/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(
      language
    )
  ) {
    return DEFAULT_LANGUAGE;
  }

  return language;
}

/* ============================================================
   REGION NORMALIZER
   ============================================================ */

function normalizeRegion(
  value
) {
  const region =
    String(
      value ||
      DEFAULT_REGION
    )
      .trim()
      .toUpperCase();

  if (
    /^[A-Z]{2}$/.test(
      region
    )
  ) {
    return region;
  }

  return DEFAULT_REGION;
}

/* ============================================================
   MEDIA TYPE NORMALIZER
   ============================================================ */

function normalizeMediaType(
  value
) {
  const allowed = [
    'all',
    'movie',
    'tv'
  ];

  return allowed.includes(
    value
  )
    ? value
    : 'all';
}

/* ============================================================
   TRENDING WINDOW
   ============================================================ */

function normalizeTimeWindow(
  value
) {
  return value === 'week'
    ? 'week'
    : 'day';
}

/* ============================================================
   SORT NORMALIZER
   ============================================================ */

function normalizeSort(
  value
) {
  const allowed = [
    'popularity.asc',
    'popularity.desc',

    'release_date.asc',
    'release_date.desc',

    'vote_average.asc',
    'vote_average.desc',

    'revenue.asc',
    'revenue.desc',

    'primary_release_date.asc',
    'primary_release_date.desc'
  ];

  return allowed.includes(
    value
  )
    ? value
    : 'popularity.desc';
}

/* ============================================================
   NUMERIC LIST SANITIZER
   ============================================================ */

function sanitizeNumericList(
  value
) {
  return String(
    value
  )
    .split(',')
    .map(
      item =>
        item.trim()
    )
    .filter(
      item =>
        /^\d+$/.test(
          item
        )
    )
    .slice(
      0,
      MAX_GENRES
    )
    .join(',');
}

/* ============================================================
   APPEND_TO_RESPONSE SANITIZER
   ============================================================ */

function sanitizeAppendList(
  value
) {
  const allowed =
    new Set([
      'credits',
      'videos',
      'images',
      'recommendations',
      'similar',
      'reviews',
      'keywords',
      'external_ids',
      'release_dates',
      'watch/providers'
    ]);

  return String(
    value
  )
    .split(',')
    .map(
      item =>
        item.trim()
    )
    .filter(
      item =>
        allowed.has(
          item
        )
    )
    .slice(
      0,
      MAX_APPEND_ITEMS
    )
    .join(',');
}

/* ============================================================
   POSITIVE INTEGER
   ============================================================ */

function normalizePositiveInteger(
  value,
  fallback,
  minimum,
  maximum
) {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(
        parsed
      ),
      minimum
    ),
    maximum
  );
}

/* ============================================================
   RETRYABLE HTTP STATUS
   ============================================================ */

function isRetryableStatus(
  status
) {
  return [
    408,
    425,
    429,
    500,
    502,
    503,
    504
  ].includes(
    status
  );
}

/* ============================================================
   HTTP ERROR FACTORY
   ============================================================ */

function createHttpError(
  status,
  message
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  return error;
}

/* ============================================================
   REQUEST ID
   ============================================================ */

function createRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return (
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 12)}`
    );
  }
}

/* ============================================================
   PATH NORMALIZER
   ============================================================ */

function normalizePath(
  pathname
) {
  if (
    !pathname ||
    pathname === '/'
  ) {
    return '/';
  }

  const normalized =
    pathname
      .replace(
        /\/{2,}/g,
        '/'
      )
      .replace(
        /\/+$/,
        ''
      );

  return (
    normalized ||
    '/'
  );
}

/* ============================================================
   SLEEP / BACKOFF
   ============================================================ */

function sleep(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}