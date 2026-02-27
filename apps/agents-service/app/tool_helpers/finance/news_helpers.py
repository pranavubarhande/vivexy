import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from .headers_helpers import HEADERS
from .cache_helpers import cache_wrapper

def get_google_news(query: str, count: int = 10):
    """Get news from Google News RSS."""
    cache_key = f"google_news:{query}:{count}"
    return cache_wrapper(cache_key, lambda: _fetch_google_news(query, count), 3600)

def _fetch_google_news(query: str, count: int = 10):
    """Fetch news from Google News RSS."""
    try:
        encoded_query = requests.utils.quote(f"{query} stock")
        url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"

        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()

        # Parse XML
        root = ET.fromstring(response.content)
        items = []

        for item in root.findall('.//item')[:count]:
            title_elem = item.find('title')
            link_elem = item.find('link')
            pub_date_elem = item.find('pubDate')

            title = title_elem.text if title_elem is not None else ""
            link = link_elem.text if link_elem is not None else ""
            pub_date = pub_date_elem.text if pub_date_elem is not None else ""

            # Parse date
            published_at = ""
            if pub_date:
                try:
                    # Parse RSS date format
                    dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %Z')
                    published_at = dt.isoformat()
                except:
                    published_at = ""

            items.append({
                'title': title,
                'link': link,
                'published_at': published_at
            })

        return items

    except Exception as e:
        print(f'Error fetching news: {e}')
        return []

def get_stock_news(stock: str, count: int = 10):
    """Get news for a specific stock."""
    try:
        news_items = get_google_news(stock, min(count, 20))
        return {
            'success': True,
            'stock': stock,
            'type': 'news',
            'count': len(news_items),
            'data': news_items
        }
    except Exception as e:
        raise Exception(f"Error getting news for {stock}: {str(e)}")