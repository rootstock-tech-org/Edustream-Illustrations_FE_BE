import cv2
import numpy as np
import config

class TrackedObject:
    def __init__(self, track_id: int, x: float, y: float, w: float, h: float, volume: float):
        self.track_id = track_id
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.volume = volume
        
        # Aggregated sensor features
        self.nir_spectra = []
        self.weights = []
        self.inductive_signals = []
        
        self.last_seen = 0.0
        self.decision = None
        self.confidence = 0.0
        self.hazard_type = None
        self.reasoning = ""
        self.scanned = False
        
        # Speed tracking
        self.speed_ms = 0.0
        self.raw_y = y  # Unsmoothed observation

class InstanceSegmenter:
    def __init__(self):
        self.next_id = 1
        self.tracks = {}  # id -> TrackedObject
        
    def process_frame(self, depth_frame: np.ndarray, dt: float, belt_speed: float) -> list[TrackedObject]:
        """
        Process a 2D depth frame to find objects and update tracking.
        depth_frame is float32 mm, baseline is config.DEPTH_BASELINE_MM.
        """
        h_px, w_px = depth_frame.shape
        
        # 1. Segment objects from background (Thresholding)
        baseline = config.DEPTH_BASELINE_MM
        height_map = baseline - depth_frame
        
        # Mask out noise (objects must be at least 5mm tall)
        mask = (height_map > 5).astype(np.uint8) * 255
        
        # Morphological operations to clean up noise and holes
        kernel = np.ones((5,5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        current_detections = []
        px_width_m = config.CONVEYOR_WIDTH_M / w_px
        px_length_m = config.SCAN_ZONE_LENGTH_M / h_px
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 30: # Minimum pixel area
                continue
                
            x_px, y_px, w_rect_px, h_rect_px = cv2.boundingRect(cnt)
            
            # Convert to physical coordinates
            # X is centered at 0
            x_m = (x_px + w_rect_px/2) / w_px * config.CONVEYOR_WIDTH_M - config.CONVEYOR_WIDTH_M/2
            y_m = (y_px + h_rect_px/2) / h_px * config.SCAN_ZONE_LENGTH_M + config.SCAN_ZONE_START_M
            w_m = w_rect_px * px_width_m
            h_m = h_rect_px * px_length_m
            
            # Estimate volume (sum of height in contour)
            c_mask = np.zeros_like(mask)
            cv2.drawContours(c_mask, [cnt], -1, 255, -1)
            item_heights = height_map[c_mask == 255] / 1000.0 # m
            volume = np.sum(item_heights) * px_width_m * px_length_m
            
            current_detections.append({
                "x": x_m, "y": y_m, "w": w_m, "h": h_m, "volume": volume
            })
            
        # 2. Tracking (Simple greedy matching by Euclidean distance)
        matched = set()
        
        # Predict current position of existing tracks based on belt speed
        for track in self.tracks.values():
            track.y += belt_speed * dt
            track.last_seen += dt
            
        for det in current_detections:
            best_track_id = None
            best_dist = float('inf')
            
            for t_id, track in self.tracks.items():
                if t_id in matched:
                    continue
                # Distance threshold
                dist = np.sqrt((det["x"] - track.x)**2 + (det["y"] - track.y)**2)
                if dist < 0.2 and dist < best_dist:
                    best_dist = dist
                    best_track_id = t_id
                    
            if best_track_id is not None:
                # Update existing track
                t = self.tracks[best_track_id]
                
                # Speed calculation (EWMA)
                if dt > 0:
                    inst_speed = (det["y"] - t.raw_y) / dt
                    t.speed_ms = t.speed_ms * 0.7 + inst_speed * 0.3
                t.raw_y = det["y"]
                
                # Smooth position
                t.x = t.x * 0.2 + det["x"] * 0.8
                t.y = det["y"] # trust Y heavily as it moves
                
                # Keep max dimensions to prevent shrinking when partially off-camera
                t.w = max(t.w, det["w"])
                t.h = max(t.h, det["h"])
                t.volume = max(t.volume, det["volume"]) # keep max volume seen
                t.last_seen = 0.0
                matched.add(best_track_id)
            else:
                # Create new track
                t = TrackedObject(self.next_id, det["x"], det["y"], det["w"], det["h"], det["volume"])
                self.tracks[self.next_id] = t
                self.next_id += 1
                
        # Remove lost tracks
        scan_zone_end = config.SCAN_ZONE_START_M + config.SCAN_ZONE_LENGTH_M
        lost = [t_id for t_id, t in self.tracks.items() if t.last_seen > 1.0 or t.y > scan_zone_end + 1.0]
        for t_id in lost:
            del self.tracks[t_id]
            
        return list(self.tracks.values())
