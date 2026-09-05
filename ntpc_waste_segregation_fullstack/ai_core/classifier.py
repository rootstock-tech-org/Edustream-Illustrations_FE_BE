"""
Random Forest Classifier
==========================
Wraps scikit-learn RandomForestClassifier for the SMART-SEG system.
Pre-trains on synthetic data generated from the material physics tables
so the classifier is ready to use immediately at startup.
"""

import numpy as np
import warnings
warnings.filterwarnings('ignore', category=UserWarning, module='sklearn')
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
import config
from sensors.item_models import MATERIAL_TABLE


class SmartSegClassifier:
    """
    Binary classifier: SAFE (0) vs HAZARD (1).
    
    Trained on synthetic data that uses the same material physics tables
    as the mock sensor provider, ensuring consistency.
    """

    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=config.RF_N_ESTIMATORS,
            max_depth=config.RF_MAX_DEPTH,
            random_state=42,
            n_jobs=None,  # Reverted to None to stop joblib UserWarning spam
            class_weight="balanced",  # Handle class imbalance
        )
        self.is_trained = False
        self.class_names = ["SAFE", "HAZARD"]
        self.training_accuracy = 0.0

    def train_on_synthetic(self, n_samples: int = None) -> float:
        """
        Generate synthetic training data and train the classifier.
        
        Creates n_samples feature vectors using the material physics tables,
        adding realistic noise to simulate real-world sensor variability.
        
        Returns:
            Cross-validated accuracy score.
        """
        n_samples = n_samples or config.RF_TRAINING_SAMPLES
        X, y = self._generate_training_data(n_samples)

        # Cross-validate before final fit
        scores = cross_val_score(self.model, X, y, cv=5, scoring="accuracy")
        self.training_accuracy = float(scores.mean())

        # Final fit on all data
        self.model.fit(X, y)
        self.is_trained = True

        print(f"[SmartSeg AI] Trained on {n_samples} samples. "
              f"CV Accuracy: {self.training_accuracy:.3f} ± {scores.std():.3f}")
        
        return self.training_accuracy

    def classify(self, features: np.ndarray) -> dict:
        """
        Classify a feature vector.
        
        Args:
            features: (8,) float32 feature vector from extract_features()
        
        Returns:
            dict with 'decision', 'confidence', 'hazard_type', 'probabilities'
        """
        if not self.is_trained:
            raise RuntimeError("Classifier not trained. Call train_on_synthetic() first.")

        features_2d = features.reshape(1, -1)
        prediction = self.model.predict(features_2d)[0]
        probabilities = self.model.predict_proba(features_2d)[0]

        decision = self.class_names[prediction]
        confidence = float(probabilities[prediction])

        # Determine hazard sub-type from feature analysis
        hazard_type = self._infer_hazard_type(features) if prediction == 1 else None

        return {
            "decision": decision,
            "confidence": confidence,
            "hazard_type": hazard_type,
            "probabilities": {
                "SAFE": float(probabilities[0]),
                "HAZARD": float(probabilities[1]),
            },
        }

    def get_feature_importances(self) -> dict:
        """Return feature importance rankings."""
        if not self.is_trained:
            return {}
        from ai_core.feature_extractor import FEATURE_NAMES
        importances = self.model.feature_importances_
        return {
            name: round(float(imp), 4)
            for name, imp in sorted(
                zip(FEATURE_NAMES, importances),
                key=lambda x: x[1],
                reverse=True,
            )
        }

    def _generate_training_data(
        self, n_samples: int
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Generate synthetic training data from material physics tables.
        
        Each sample is an 8-dim feature vector with added noise,
        labeled 0 (SAFE) or 1 (HAZARD) based on ground truth.
        """
        X = []
        y = []

        # Calculate samples per type based on configured probabilities
        for mat_type, props in MATERIAL_TABLE.items():
            prob = config.ITEM_TYPE_PROBABILITIES.get(mat_type, 0.1)
            n_type = max(50, int(n_samples * prob))

            for _ in range(n_type):
                # Random physical properties within material ranges
                density = np.random.uniform(*props.density_range)
                mass = np.random.uniform(*props.weight_range)
                volume = mass / density

                nir_ch = np.random.uniform(*props.nir_ch_response)
                nir_oh = np.random.uniform(*props.nir_oh_response)
                nir_mean = (nir_ch + nir_oh) / 2 * np.random.uniform(0.6, 1.0)

                metal = 1.0 if props.metal_present else 0.0
                # Add false positive/negative noise
                if metal == 1.0 and np.random.random() < 0.005:
                    metal = 0.0
                elif metal == 0.0 and np.random.random() < 0.001:
                    metal = 1.0

                inductive_str = (
                    np.random.uniform(0.6, 0.95) if props.metal_present
                    else np.random.uniform(0.0, 0.05)
                )
                dielectric = np.random.uniform(*props.dielectric_range)

                # Add measurement noise
                density += np.random.normal(0, density * 0.08)  # 8% noise
                nir_ch += np.random.normal(0, 0.05)
                nir_oh += np.random.normal(0, 0.05)
                nir_mean += np.random.normal(0, 0.03)
                inductive_str += np.random.normal(0, 0.03)
                dielectric += np.random.normal(0, config.CAPACITIVE_NOISE_SIGMA)
                mass += np.random.normal(0, config.LOADCELL_NOISE_SIGMA_KG)

                # Clip to valid ranges
                density = max(10, density)
                nir_ch = np.clip(nir_ch, 0, 1)
                nir_oh = np.clip(nir_oh, 0, 1)
                nir_mean = np.clip(nir_mean, 0, 1)
                inductive_str = np.clip(inductive_str, 0, 1)
                dielectric = np.clip(dielectric, 0, 1)
                mass = max(0.01, mass)

                features = [
                    density, nir_ch, nir_oh, nir_mean,
                    metal, inductive_str, dielectric, mass,
                ]
                X.append(features)
                y.append(1 if props.is_hazard else 0)

        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.int32)

        # Shuffle
        indices = np.random.permutation(len(X))
        return X[indices], y[indices]

    def _infer_hazard_type(self, features: np.ndarray) -> str:
        """Infer the specific hazard sub-type from feature patterns."""
        density = features[0]
        nir_ch = features[1]
        metal = features[4]
        mass = features[7]

        if metal > 0.5 and mass > 5:
            return "tire_metal" if nir_ch > 0.2 else "metal_scrap"
        if density > 2000 and nir_ch < 0.1:
            return "stone" if density < 2500 else "thick_glass"
        if density > 1200 and nir_ch > 0.3:
            return "plastic_bag_stone"
        if density > 2000:
            return "thick_glass"
        return "unknown_hazard"
