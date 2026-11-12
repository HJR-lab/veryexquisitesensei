/**
 * The wheelthrowing courses currently listed on Shopify.
 *
 * Until now the app only learnt a course existed once somebody bought it — a
 * cohort was "visible" from its first enrollment row. That is too late to offer
 * a current student the next course before the public fills it. Reading the
 * catalogue means the studio lists new dates on Shopify as it always has, and
 * the app can see them that same night.
 *
 * Only single-course products are returned. Packages ("3 Course Package") and
 * class pools ("10 Classes") carry the same slot variants, but a continuing
 * student is offered one course at full price, so those are not candidates.
 *
 * Variants are parsed by the same parseCourseInfo the order webhook uses, so a
 * listing the webhook could not enrol from is never offered either.
 */

const { parseCourseInfo } = require('./courseScheduler');
const { ymdFromInstant, todaySGT } = require('./sgtDate');

const CATALOG_QUERY = `
  query wtCourses($cursor: String) {
    products(first: 50, after: $cursor, query: "title:Wheelthrowing* AND status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            title
            price
            inventoryQuantity
            inventoryPolicy
            inventoryItem { tracked }
          }
        }
      }
    }
  }
`;

// Product titles that are not a single course.
const NOT_SINGLE_COURSE = /package|classes|flexible|glazing|handbuilding|gift|voucher/i;

/**
 * Parse one variant, guessing the year.
 *
 * Variant titles carry "30 Oct—4 Dec" with no year, and parseCourseInfo takes
 * the year from a reference date. A January course listed in November would
 * otherwise parse as last January and be dropped as already over, so a date
 * that lands in the past is read as next year's.
 */
function parseVariant(productTitle, variantTitle, today) {
  const year = Number(today.slice(0, 4));
  let info = parseCourseInfo(productTitle, variantTitle, `${today}T12:00:00+08:00`);
  if (info.endDate && ymdFromInstant(info.endDate) < today) {
    info = parseCourseInfo(productTitle, variantTitle, `${year + 1}-06-01T12:00:00+08:00`);
  }
  return info;
}

/**
 * Turn the raw products response into dated course listings. Pure, so the
 * filtering can be tested without Shopify.
 *
 * @param {Array} products  products.nodes from CATALOG_QUERY
 * @param {string} [today]  YYYY-MM-DD in Singapore
 * @returns {Array<object>}
 */
function parseCatalog(products, today = todaySGT()) {
  const courses = [];
  for (const product of products || []) {
    if (!product?.title || NOT_SINGLE_COURSE.test(product.title)) continue;

    for (const variant of product.variants?.nodes || []) {
      const info = parseVariant(product.title, variant.title, today);
      if (!info.courseType || !info.courseType.startsWith('Wheelthrowing')) continue;
      if (!info.startDate || !info.schedulePattern || !info.classTime) continue;

      const startDate = ymdFromInstant(info.startDate);
      if (startDate <= today) continue;

      courses.push({
        variantId: variant.id,
        productId: product.id,
        productTitle: product.title,
        variantTitle: variant.title,
        price: variant.price != null ? Number(variant.price) : null,
        courseType: info.courseType,
        schedulePattern: info.schedulePattern,
        classTime: info.classTime,
        startDate,
        endDate: info.endDate ? ymdFromInstant(info.endDate) : null,
        numberOfWeeks: info.numberOfWeeks,
        inventoryTracked: variant.inventoryItem?.tracked === true,
        inventoryQuantity: variant.inventoryQuantity ?? null,
        oversellAllowed: variant.inventoryPolicy === 'CONTINUE',
      });
    }
  }
  return courses.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Fetch and parse every listed single WT course starting after today.
 * Throws if Shopify cannot be read: callers must not conclude "nothing listed"
 * from a failed call.
 */
async function fetchUpcomingWtCourses() {
  const { shopifyGraphQL } = require('./shopifyGraphQL');
  const products = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const { body } = await shopifyGraphQL(CATALOG_QUERY, { cursor });
    const conn = body?.data?.products;
    if (!conn) throw new Error('Shopify returned no products connection');
    products.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return parseCatalog(products);
}

module.exports = { parseCatalog, fetchUpcomingWtCourses, NOT_SINGLE_COURSE };
