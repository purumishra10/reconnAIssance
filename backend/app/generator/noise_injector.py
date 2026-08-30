import random
from datetime import date, timedelta


def inject_ref_typo(ref: str, rng: random.Random) -> str:
    """Inject realistic typos in reference IDs: case flip, character swap, or digit transposition."""
    if len(ref) < 4:
        return ref.lower()

    choice = rng.choice(["case", "swap", "transpose", "hyphen"])

    if choice == "case":
        # Flip case of prefix or entire ref
        return ref.lower() if rng.random() < 0.5 else ref.upper()

    elif choice == "swap":
        # Swap two adjacent characters in numeric part if possible
        prefix, num_part = ref.split("-", 1) if "-" in ref else ("", ref)
        if len(num_part) >= 2:
            idx = rng.randint(0, len(num_part) - 2)
            swapped_num = (
                num_part[:idx]
                + num_part[idx + 1]
                + num_part[idx]
                + num_part[idx + 2 :]
            )
            return f"{prefix}-{swapped_num}" if prefix else swapped_num
        return ref

    elif choice == "transpose":
        # Replace one digit with a visually similar or adjacent digit (e.g. 0->O, 1->I or off-by-one digit)
        chars = list(ref)
        digit_indices = [i for i, c in enumerate(chars) if c.isdigit()]
        if digit_indices:
            idx = rng.choice(digit_indices)
            curr_d = int(chars[idx])
            new_d = (curr_d + rng.choice([-1, 1])) % 10
            chars[idx] = str(new_d)
            return "".join(chars)
        return ref

    else:  # "hyphen"
        # Omit hyphen or replace with underscore/space
        return ref.replace("-", rng.choice(["", "_", " "]))


def inject_amount_drift(amount: int, rng: random.Random) -> int:
    """Inject small 1-5 paise rounding drift."""
    drift = rng.randint(1, 5) * rng.choice([-1, 1])
    return max(100, amount + drift)


def inject_date_drift(dt_str: str, rng: random.Random, max_days: int = 2) -> str:
    """Shift date by ±1 or 2 days."""
    try:
        dt = date.fromisoformat(dt_str)
        shifted = dt + timedelta(days=rng.choice([-1, 1]) * rng.randint(1, max_days))
        return shifted.isoformat()
    except Exception:
        return dt_str


def generate_messy_narration(utr: str, batch_id: str, rng: random.Random) -> str:
    """Generate realistic unstructured bank statement narration with format variations."""
    templates = [
        f"NEFT/CMS/RAZORPAY/{utr}/SETTLEMENT",
        f"ACH CR-RAZORPAY SOFTWARE PRIVATE LIMITED-{utr}-SETL",
        f"RTGS/CORP/{utr}/RAZORPAY RECON/{batch_id}",
        f"CMS-RAZORPAY SETTLEMENT {batch_id} UTR:{utr}",
        f"IMPS/P2A/{utr}/RZPY/{batch_id}",
        f"NEFT CR-{utr}-RAZORPAY-{batch_id}",
    ]
    narration = rng.choice(templates)
    # 5% chance of truncated UTR or extra bank code noise
    if rng.random() < 0.05:
        narration = narration[: rng.randint(len(narration) - 6, len(narration) - 1)]
    return narration
