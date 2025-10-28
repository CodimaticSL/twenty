import { extractDomainFromLink } from 'src/modules/contact-creation-manager/utils/extract-domain-from-link.util';

describe('extractDomainFromLink', () => {
  it('should extract domain from link', () => {
    const link = 'https://www.nodiaflow.com';
    const result = extractDomainFromLink(link);

    expect(result).toBe('nodiaflow.com');
  });

  it('should extract domain from link without www', () => {
    const link = 'https://nodiaflow.com';
    const result = extractDomainFromLink(link);

    expect(result).toBe('nodiaflow.com');
  });

  it('should extract domain from link without protocol', () => {
    const link = 'nodiaflow.com';
    const result = extractDomainFromLink(link);

    expect(result).toBe('nodiaflow.com');
  });

  it('should extract domain from link with path', () => {
    const link = 'https://nodiaflow.com/about';
    const result = extractDomainFromLink(link);

    expect(result).toBe('nodiaflow.com');
  });
});
