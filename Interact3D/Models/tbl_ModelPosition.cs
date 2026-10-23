using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Interact3D.Models;

[Table("tbl_ModelPosition")]
public class tbl_ModelPosition
{
    [Key]
    public int Id { get; set; }

    public int UserId { get; set; }
    public int ModelId { get; set; }

    public double PositionX { get; set; } = 0;
    public double PositionY { get; set; } = 0;
    public double PositionZ { get; set; } = 0;
    public double RotationY { get; set; } = 0;

    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    // Navigation properties
    [ForeignKey(nameof(UserId))]
    public virtual tbl_User? User { get; set; }

    [ForeignKey(nameof(ModelId))]
    public virtual tbl_Model3D? Model { get; set; }
}