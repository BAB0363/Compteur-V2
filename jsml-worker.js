// jsml-worker.js
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');

self.onmessage = async function(e) {
    const { type, features, labels, numClasses } = e.data;

    if (!features || features.length === 0) {
        self.postMessage({ success: false, type: type });
        return;
    }

    try {
        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

        const model = tf.sequential();
        // Couche d'entrée passée à 10 neurones (pour le Rythme/Heure et Tendance 10m)
        model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape: [10] }));
        model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
        model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        await model.fit(xs, ys, {
            epochs: 50,
            shuffle: true
        });

        await model.save(`indexeddb://model-${type}`);

        xs.dispose();
        ys.dispose();

        self.postMessage({ success: true, type: type });

    } catch (error) {
        console.error("Erreur dans le Worker TF:", error);
        self.postMessage({ success: false, type: type, error: error.message });
    }
};
