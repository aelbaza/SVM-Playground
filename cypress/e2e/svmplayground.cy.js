describe('SVM Playground e2e', () => {
  it('should load SVM Playground', () => {
    cy.visit('http://127.0.0.1:5500/SVM-Playground/dist/index.html');
  });

  it('should display test points', () => {
    cy.get('#output-heatmap g.test circle')
      .should('not.exist');
    cy.get('label[for="show-test-data"]').click();
    cy.get('#output-heatmap g.test circle')
      .should('be.visible');
  });

  it('should change data parameters', () => {
    cy.get('input#percTrainData')
      .invoke('val', 90)
      .trigger('change');
    cy.get('input#noise')
      .invoke('val', 50)
      .trigger('change');
  });
  it('should change Hyperparameters', () => {
    cy.get('input#gamma')
      .invoke('val', 0.9)
      .trigger('change');
    cy.get('input#polyDegree')
      .invoke('val', 3)
      .trigger('change');
      cy.get('input#parameterC')
      .invoke('val', 49)
      .trigger('change');
  });
  describe('Classification', () => {
  

    it('should generate a new data set', () => {
      cy.get('canvas[data-dataset="xor"]').click();
      cy.get('canvas[data-dataset="gauss"]').click();
      cy.get('canvas[data-dataset="spiral"]').click();
      cy.get('#data-regen-button').click();
    });

    it('should blur the heat maps during training', () => {
      cy.get('button#start-button').click();

    });
    it('should display a card when hovering over a data point', () => {
      // TODO: Add assertions for plot.
      cy.get('#output-heatmap g.train circle')

    });
    it('should hover over a tree heat map', () => {
      // TODO: Add assertions for plot.
      cy.get('#output-heatmap')
        .trigger('mouseenter', { force: true });
      cy.get('#output-heatmap')
        .trigger('mouseleave', { force: true });
    });

  });


});