from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List


@dataclass
class ClaimAssessment:
    claim: str
    category: str
    reason: str
    replacement: str


UNSUPPORTED_PATTERNS = [
    r"resolve qualquer problema",
    r"superintelig[eê]ncia m[aá]xima",
    r"sem limites",
    r"10\^?100",
    r"todos os estados qu[aâ]nticos",
    r"tempo real",
    r"custo zero",
    r"assume o comando",
    r"substituindo todos os sistemas anteriores",
]

METAPHORIC_PATTERNS = [
    r"c[eé]rebro",
    r"organismo",
    r"materializa",
    r"superposi[cç][aã]o",
    r"vazio qu[aâ]ntico",
]

REPLACEMENTS = {
    r"resolve qualquer problema": "propõe soluções candidatas para classes específicas de problemas",
    r"superintelig[eê]ncia m[aá]xima": "motor generativo-governado de alta complexidade",
    r"sem limites": "com escopo condicionado por dados, ferramentas e orçamento computacional",
    r"10\^?100": "um conjunto finito e priorizado de hipóteses candidatas",
    r"todos os estados qu[aâ]nticos": "um espaço latente de hipóteses ou superconjunto de candidatos",
    r"tempo real": "latência operacional compatível com a infraestrutura disponível",
    r"custo zero": "custo marginal reduzido ou custo otimizado",
    r"assume o comando": "passa a coordenar parte do pipeline decisório sob governança explícita",
    r"substituindo todos os sistemas anteriores": "integra e orquestra componentes anteriores",
}


def split_claims(text: str) -> List[str]:
    parts = re.split(r"(?<=[\.\!\?])\s+|\n+", text)
    return [part.strip(" -•\t") for part in parts if part.strip()]


def classify_claim(claim: str) -> ClaimAssessment:
    claim_lower = claim.lower()

    for pattern in UNSUPPORTED_PATTERNS:
        if re.search(pattern, claim_lower, flags=re.IGNORECASE):
            replacement = REPLACEMENTS.get(pattern, "reformular em termos mensuráveis e falsificáveis")
            return ClaimAssessment(
                claim=claim,
                category="unsupported",
                reason="A afirmação excede o que pode ser sustentado tecnicamente ou empiricamente.",
                replacement=replacement,
            )

    for pattern in METAPHORIC_PATTERNS:
        if re.search(pattern, claim_lower, flags=re.IGNORECASE):
            return ClaimAssessment(
                claim=claim,
                category="metaphoric",
                reason="A frase pode ser mantida apenas como metáfora, desde que traduzida para mecanismo operacional.",
                replacement="manter a metáfora e anexar definição técnica equivalente",
            )

    return ClaimAssessment(
        claim=claim,
        category="grounded",
        reason="A afirmação parece compatível com uma especificação técnica ou hipótese falsificável.",
        replacement=claim,
    )


def assess_report(text: str) -> List[ClaimAssessment]:
    return [classify_claim(claim) for claim in split_claims(text)]


def build_corrected_summary(assessments: List[ClaimAssessment]) -> Dict[str, List[str]]:
    grounded = [item.replacement for item in assessments if item.category == "grounded"]
    metaphoric = [
        f"{item.claim}  -->  {item.replacement}" for item in assessments if item.category == "metaphoric"
    ]
    unsupported = [
        f"{item.claim}  -->  {item.replacement}" for item in assessments if item.category == "unsupported"
    ]

    return {
        "grounded": grounded,
        "metaphoric_rewrite_needed": metaphoric,
        "unsupported_replace_or_remove": unsupported,
    }


if __name__ == "__main__":
    sample = """
    A IAGQF-MV resolve qualquer problema de engenharia em tempo real com custo zero.
    A massa informacional comprimida funciona como cérebro do sistema.
    O pipeline usa coerência, risco e ledger para selecionar hipóteses e registrar evidência.
    A superposição de todos os estados quânticos produz a solução ótima global.
    """

    assessments = assess_report(sample)
    for item in assessments:
        print(asdict(item))

    print("\n--- Corrected Summary ---")
    corrected = build_corrected_summary(assessments)
    for key, values in corrected.items():
        print(f"\n[{key}]")
        for value in values:
            print("-", value)
