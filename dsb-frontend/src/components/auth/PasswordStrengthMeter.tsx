import type { PasswordStrength } from './passwordStrengthUtils';
import { countMet, checkPasswordStrength, LABELS, STRENGTH_LABELS } from './passwordStrengthUtils';

interface Props {
    password: string;
}

export default function PasswordStrengthMeter({ password }: Props) {
    if (!password) return null;

    const strength = checkPasswordStrength(password);
    const met = countMet(strength);

    const bars = [1, 2, 3, 4, 5].map((i) => (
        <div
            key={i}
            className={`auth-strength-bar${i <= met ? ` auth-strength-bar--active-${met}` : ''}`}
        />
    ));

    return (
        <div className="auth-strength" aria-label={`Password strength: ${STRENGTH_LABELS[met]}`}>
            <div className="auth-strength-bars">{bars}</div>
            <div className="auth-strength-label">
                {STRENGTH_LABELS[met]}
            </div>
            <div className="auth-requirements" role="list" aria-label="Password requirements">
                {(Object.keys(strength) as Array<keyof PasswordStrength>).map((key) => (
                    <div
                        key={key}
                        className={`auth-req${strength[key] ? ' auth-req--met' : ''}`}
                        role="listitem"
                        aria-label={`${LABELS[key]}: ${strength[key] ? 'met' : 'not met'}`}
                    >
                        <span className="auth-req-dot" />
                        {LABELS[key]}
                    </div>
                ))}
            </div>
        </div>
    );
}