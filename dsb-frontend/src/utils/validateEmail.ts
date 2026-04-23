/**
 * Client-side email validation (pragmatic subset of RFC 5321 / hostname rules).
 * Confirms a proper local part, multi-label domain, and alphabetic TLD (e.g. .com, .org).
 * Does not verify the mailbox exists; the API remains authoritative.
 */
export function validateEmailAddress(value: string): string | undefined {
    const v = value.trim();
    if (!v) return 'Email address is required.';
    if (v.length > 100) return 'Email address must be 100 characters or fewer.';

    const atIndex = v.indexOf('@');
    const lastAt = v.lastIndexOf('@');
    if (atIndex === -1) {
        return 'Enter an email address that includes @ and a domain (for example, name@company.com).';
    }
    if (atIndex !== lastAt) return 'Enter a valid email address.';

    const local = v.slice(0, atIndex);
    const domain = v.slice(atIndex + 1).trim().toLowerCase();

    if (!local || !domain) return 'Enter a valid email address.';
    if (local.length > 64) return 'Enter a valid email address.';

    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
        return 'Enter a valid email address.';
    }

    if (
        !/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)
    ) {
        return 'Enter a valid email address.';
    }

    if (
        domain.length > 253 ||
        domain.includes('..') ||
        domain.startsWith('.') ||
        domain.endsWith('.')
    ) {
        return 'Enter an email address with a valid domain (for example, name@gmail.com).';
    }

    const labels = domain.split('.');
    if (labels.length < 2) {
        return 'Enter an email address with a valid domain (for example, name@gmail.com).';
    }

    for (const label of labels) {
        if (label.length < 1 || label.length > 63) {
            return 'Enter an email address with a valid domain (for example, name@gmail.com).';
        }
        if (label.startsWith('-') || label.endsWith('-')) {
            return 'Enter an email address with a valid domain (for example, name@gmail.com).';
        }
        if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])|xn--[a-z0-9-]+)$/i.test(label)) {
            return 'Enter an email address with a valid domain (for example, name@gmail.com).';
        }
    }

    const tld = labels[labels.length - 1];
    if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) {
        return 'Enter an email address with a valid domain ending in a valid extension (for example, .com or .org).';
    }

    return undefined;
}
