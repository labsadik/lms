import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description?: string;
  image?: string;
  canonical?: string;
  jsonLd?: Record<string, any>;
}

export const useSEO = ({ title, description, image, canonical, jsonLd }: SEOProps) => {
  useEffect(() => {
    const fullTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;
    document.title = fullTitle;

    const setMeta = (name: string, content: string, attr: 'name' | 'property' = 'name') => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    if (description) {
      setMeta('description', description.slice(0, 160));
      setMeta('og:description', description.slice(0, 160), 'property');
    }
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:type', 'website', 'property');
    if (image) setMeta('og:image', image, 'property');

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = canonical || window.location.href;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;

    // JSON-LD
    let ld = document.getElementById('jsonld-seo') as HTMLScriptElement | null;
    if (jsonLd) {
      if (!ld) {
        ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'jsonld-seo';
        document.head.appendChild(ld);
      }
      ld.textContent = JSON.stringify(jsonLd);
    } else if (ld) {
      ld.remove();
    }
  }, [title, description, image, canonical, JSON.stringify(jsonLd)]);
};
