import urllib.request
import json
import cv2
import numpy as np

def test_live_predict_loperamide():
    img = np.full((224, 224, 3), 180, dtype=np.uint8)
    cv2.circle(img, (112, 112), 50, (30, 200, 240), -1)
    _, encoded = cv2.imencode('.jpg', img)
    img_bytes = encoded.tobytes()

    boundary = '----WebKitFormBoundaryX'
    body = bytearray()
    body.extend(f'--{boundary}\r\n'.encode('utf-8'))
    body.extend(b'Content-Disposition: form-data; name="image"; filename="tablet.jpg"\r\n')
    body.extend(b'Content-Type: image/jpeg\r\n\r\n')
    body.extend(img_bytes)
    body.extend(b'\r\n')

    body.extend(f'--{boundary}\r\n'.encode('utf-8'))
    body.extend(b'Content-Disposition: form-data; name="medicine_name"\r\n\r\n')
    body.extend(b'Loperamide\r\n')
    body.extend(f'--{boundary}--\r\n'.encode('utf-8'))

    req = urllib.request.Request(
        'http://127.0.0.1:5000/predict',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )

    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("Response received:")
        print("  Result:", data.get("result"))
        print("  Confidence:", data.get("confidence"))
        expl = data.get("explanation", {})
        print("  Matched med:", expl.get("matched_medicine"))
        print("  Note:", expl.get("note"))
        print("  Top reasons:", len(expl.get("top_reasons", [])))
        print("  Features:", len(expl.get("features", [])))
        assert expl.get("matched_medicine") == "Lopramide"
        assert len(expl.get("top_reasons", [])) > 0
        assert len(expl.get("features", [])) == 17

if __name__ == "__main__":
    test_live_predict_loperamide()
