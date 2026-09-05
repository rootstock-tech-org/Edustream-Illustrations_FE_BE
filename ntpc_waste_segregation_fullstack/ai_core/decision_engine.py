"""
Decision Engine
================
Orchestrates the full pipeline: feature extraction → classification → failsafe rules.
This is the single entry point the simulation loop calls for AI decisions.
"""

import time
from collections import deque
from ai_core.segmenter import TrackedObject
from ai_core.feature_extractor import extract_features, features_to_dict, FEATURE_NAMES
from ai_core.classifier import SmartSegClassifier
import config


class DecisionEngine:
    """
    Orchestrates the AI decision pipeline with failsafe overrides.
    
    The engine applies two layers of decision-making:
    1. Random Forest classification on the 8-dim feature vector.
    2. Hard-coded failsafe rules that override the RF when
       physics-based thresholds are clearly exceeded.
    
    This ensures safety even if the ML model is uncertain.
    """

    def __init__(self):
        self.classifier = SmartSegClassifier()
        self.decision_log: list[dict] = []
        self._by_type: dict[str, int] = {}
        self._stats = {
            "total": 0,
            "safe": 0,
            "hazard": 0,
            "failsafe_overrides": 0,
            "low_confidence": 0,
            "correct_classifications": 0,
        }
        self._recent_results = deque(maxlen=20)

    def initialize(self) -> float:
        """Train the classifier on synthetic data. Returns accuracy."""
        return self.classifier.train_on_synthetic()

    def reset(self) -> None:
        """Reset all decision statistics and logs."""
        self._stats = {
            "total": 0,
            "safe": 0,
            "hazard": 0,
            "failsafe_overrides": 0,
            "low_confidence": 0,
            "correct_classifications": 0,
        }
        self._by_type.clear()
        self.decision_log.clear()
        self._recent_results.clear()

    def decide(self, track: TrackedObject, ground_truth_type: str = None) -> dict:
        """
        Run the full decision pipeline on a tracked object.
        """
        # Step 1: Extract features
        features = extract_features(track)
        feature_dict = features_to_dict(features)

        # Step 2: Run classifier
        result = self.classifier.classify(features)

        # Step 3: Apply failsafe rules (can override RF)
        failsafe_triggered = False
        reasoning_parts = []

        density = features[0]
        nir_ch = features[1]
        metal_flag = features[4]
        mass = features[7]

        # Failsafe 1: High density + no polymer signature → HAZARD
        if density > config.DENSITY_HAZARD_THRESHOLD and nir_ch < config.NIR_LOW_THRESHOLD:
            result["decision"] = "HAZARD"
            result["confidence"] = max(result["confidence"], 0.95)
            failsafe_triggered = True
            reasoning_parts.append(
                f"FAILSAFE: Density {density:.0f} kg/m³ > {config.DENSITY_HAZARD_THRESHOLD} "
                f"with near-zero NIR polymer response ({nir_ch:.3f}). "
                f"Consistent with stone/concrete/glass."
            )

        # Failsafe 2: Metal detected + heavy → HAZARD
        if metal_flag > 0.5 and mass > config.MASS_HEAVY_THRESHOLD:
            result["decision"] = "HAZARD"
            result["confidence"] = max(result["confidence"], 0.92)
            failsafe_triggered = True
            reasoning_parts.append(
                f"FAILSAFE: Metal detected with mass {mass:.1f}kg > "
                f"{config.MASS_HEAVY_THRESHOLD}kg threshold. "
                f"Consistent with tire/metal scrap."
            )

        # Build human-readable reasoning
        if not reasoning_parts:
            if result["decision"] == "HAZARD":
                reasoning_parts.append(
                    f"RF classified as HAZARD (confidence {result['confidence']:.1%}). "
                    f"Density: {density:.0f} kg/m³, NIR C-H: {nir_ch:.3f}, "
                    f"Metal: {'Yes' if metal_flag > 0.5 else 'No'}, Mass: {mass:.1f}kg."
                )
            else:
                reasoning_parts.append(
                    f"RF classified as SAFE (confidence {result['confidence']:.1%}). "
                    f"Low density ({density:.0f} kg/m³) with "
                    f"{'strong' if nir_ch > 0.3 else 'weak'} polymer signature."
                )

        # Low confidence warning
        low_confidence = result["confidence"] < config.CONFIDENCE_THRESHOLD
        if low_confidence:
            reasoning_parts.append(
                f"⚠ LOW CONFIDENCE ({result['confidence']:.1%} < "
                f"{config.CONFIDENCE_THRESHOLD:.0%}). Manual review recommended."
            )

        # Compile final result
        decision_result = {
            "decision": result["decision"],
            "confidence": result["confidence"],
            "hazard_type": result.get("hazard_type"),
            "reasoning": " | ".join(reasoning_parts),
            "features": feature_dict,
            "probabilities": result.get("probabilities", {}),
            "failsafe_triggered": failsafe_triggered,
            "low_confidence": low_confidence,
            "timestamp": time.time(),
        }

        # Update stats
        self._stats["total"] += 1
        item_key = ground_truth_type or result.get("hazard_type") or "unknown"
        self._by_type[item_key] = self._by_type.get(item_key, 0) + 1

        if result["decision"] == "SAFE":
            self._stats["safe"] += 1
        else:
            self._stats["hazard"] += 1
        if failsafe_triggered:
            self._stats["failsafe_overrides"] += 1
        if low_confidence:
            self._stats["low_confidence"] += 1
            
        # Track ground truth accuracy (Evaluation Only)
        is_hazard_true = None
        if ground_truth_type:
            from sensors.item_models import MATERIAL_TABLE
            mat = MATERIAL_TABLE.get(ground_truth_type)
            if mat is not None:
                is_hazard_true = mat.is_hazard
                
        if is_hazard_true is not None:
            is_hazard_pred = (result["decision"] == "HAZARD")
            is_correct = (is_hazard_true == is_hazard_pred)
            if is_correct:
                self._stats["correct_classifications"] += 1
            self._recent_results.append(is_correct)

        # Log for audit
        self.decision_log.append({
            "item_id": f"track_{track.track_id}",
            "item_type": ground_truth_type or "unknown",
            **decision_result,
        })

        # Keep log manageable
        if len(self.decision_log) > 1000:
            self.decision_log = self.decision_log[-500:]

        return decision_result

    @property
    def stats(self) -> dict:
        """Return current decision statistics."""
        total = max(1, self._stats["total"])
        s = self._stats.copy()
        s["by_type"] = self._by_type.copy()
        s["hazard_rate"] = s["hazard"] / total
        s["override_rate"] = s["failsafe_overrides"] / total
        s["low_confidence_rate"] = s["low_confidence"] / total
        s["simulation_accuracy"] = s["correct_classifications"] / total
        
        if self._recent_results:
            s["rolling_accuracy"] = sum(self._recent_results) / len(self._recent_results)
        else:
            s["rolling_accuracy"] = s["simulation_accuracy"]
            
        s["feature_importance"] = self.classifier.get_feature_importances()
        return s
