import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { HEADERS } from '@/tool-helpers/headers.helpers';

export const getGoogleNews = async (query: string, count = 10) => {
  try {
    const encodedQuery = encodeURIComponent(`${query} stock`);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });

    const result = await parseStringPromise(response.data, {
      explicitArray: false,
    });
    const items = result?.rss?.channel?.item || [];
    const newsItems = (Array.isArray(items) ? items : [items]) as Array<{
      title?: string | { _: string };
      link?: string | { _: string };
      pubDate?: string;
    }>;

    return newsItems.slice(0, count).map((item) => ({
      title:
        typeof item.title === 'object' ? item.title._ || '' : item.title || '',
      link: typeof item.link === 'object' ? item.link._ || '' : item.link || '',
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : '',
    }));
  } catch (error) {
    console.error('Error fetching news:', error);
    return [] as const;
  }
};

export const getStockNews = async (stock: string, count = 10) => {
  try {
    const newsItems = await getGoogleNews(stock, Math.min(count, 20));
    return {
      success: true,
      stock,
      type: 'news',
      count: newsItems.length,
      data: newsItems,
    };
  } catch (error) {
    throw new Error(
      `Error getting news for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
