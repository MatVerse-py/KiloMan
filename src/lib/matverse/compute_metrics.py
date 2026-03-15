import ast
import json
import math
import os
from typing import Dict

CODE_EXTENSIONS = ('.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs')
RISK_FILES = {'.env', 'secrets.json', 'credentials.json', 'passwords.txt'}


def iter_files(root: str = '.'):
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
        for file_name in files:
            yield current_root, file_name


def count_code_elements(root: str = '.') -> float:
    total = 0
    for current_root, file_name in iter_files(root):
        if not file_name.endswith(('.py', '.ts', '.tsx', '.js', '.jsx')):
            continue

        full_path = os.path.join(current_root, file_name)
        try:
            with open(full_path, 'r', encoding='utf-8') as file_handle:
                content = file_handle.read()
                tree = ast.parse(content)
                functions = sum(1 for node in ast.walk(tree) if isinstance(node, ast.FunctionDef))
                classes = sum(1 for node in ast.walk(tree) if isinstance(node, ast.ClassDef))
                total += functions + classes * 2
        except (SyntaxError, ValueError, OSError, UnicodeDecodeError):
            continue

    return min(total / 100, 1.0)


def compute_efficiency(root: str = '.') -> float:
    total_lines = 0
    for current_root, file_name in iter_files(root):
        if not file_name.endswith(CODE_EXTENSIONS):
            continue

        full_path = os.path.join(current_root, file_name)
        try:
            with open(full_path, 'r', encoding='utf-8') as file_handle:
                total_lines += sum(1 for _ in file_handle)
        except (OSError, UnicodeDecodeError):
            continue

    return min(total_lines / 10000, 1.0)


def compute_cvar(root: str = '.') -> float:
    risk_count = 0.0
    total_files = 0

    for _, file_name in iter_files(root):
        total_files += 1
        if file_name in RISK_FILES:
            risk_count += 1.0
        elif file_name.endswith('.log'):
            risk_count += 0.5

    return min(risk_count / max(total_files, 1), 1.0)


def compute_maturity(psi: float, theta: float, cvar: float, autonomy: float = 0.6) -> float:
    robustness = 1 - cvar
    return max(0.0, min(1.0, 0.35 * psi + 0.25 * theta + 0.25 * robustness + 0.15 * autonomy))


def compute_metrics(root: str = '.') -> Dict[str, float | str]:
    coherence = count_code_elements(root)
    efficiency = compute_efficiency(root)
    cvar = compute_cvar(root)
    pole = 0.5

    omega = 0.4 * coherence + 0.3 * efficiency + 0.2 * (1 - cvar) + 0.1 * pole
    maturity = compute_maturity(coherence, efficiency, cvar)

    if omega >= 0.8:
        decision = 'PASS'
    elif omega >= 0.5:
        decision = 'ESCALATE'
    else:
        decision = 'BLOCK'

    return {
        'psi': round(coherence, 3),
        'theta': round(efficiency, 3),
        'cvar': round(cvar, 3),
        'pole': round(pole, 3),
        'omega': round(omega, 3),
        'maturity': round(maturity, 3),
        'decision': decision,
    }


if __name__ == '__main__':
    print(json.dumps(compute_metrics()))
