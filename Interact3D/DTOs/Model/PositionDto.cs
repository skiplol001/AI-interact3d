namespace Interact3D.DTOs.Model;

public class PositionDto
{
    public int ModelId { get; set; }
    public double PositionX { get; set; }
    public double PositionY { get; set; }
    public double PositionZ { get; set; }
    public double RotationY { get; set; }
    public DateTime UpdatedAt { get; set; }
}